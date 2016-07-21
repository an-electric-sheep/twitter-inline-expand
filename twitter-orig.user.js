// ==UserScript==
// @name        Twitter Inline Expansion
// @namespace   https://github.com/an-electric-sheep/
// @description Inline-expansion of :orig (full-resolution) twitter images
// @match       *://*.twitter.com/*
// @version     0.2.3
// @run-at			document-start
// @noframes
// @grant       unsafeWindow
// @grant				GM_xmlhttpRequest
// ==/UserScript==

'use strict';

const cssPrefix = "mediatweaksuserscript";

// normal + mobile page
const TweetImageSelector = `
	.tweet .js-adaptive-photo img ,
	.Tweet .CroppedPhoto img
`;
	
const TweetVideoSelector = ".AdaptiveMedia-video iframe";

let alreadyVisited = new WeakSet();

	
function prefixed(str) {
	return cssPrefix + str;	
}


function mutationObserverCallback(mutations) {
	setTimeout(() => {
		try {
			for(let mutation of mutations) {
				if(mutation.type != "childList")
					continue;
				for(let node of [mutation.target, ...mutation.addedNodes]) {
					if(node.nodeType != Node.ELEMENT_NODE)
						continue;

					onAddedNode(node)
					for(let subNode of node.querySelectorAll(TweetVideoSelector))
						onAddedNode(subNode);
					for(let subNode of node.querySelectorAll(TweetImageSelector))
						onAddedNode(subNode);
				}
			}
		} catch(e) {
			console.log(e)
		}
	}, 1)
}

function visitOnce(element, func) {
	if(alreadyVisited.has(element))
		return;
	alreadyVisited.add(element);
	func()
}

function onAddedNode(node) {
	if(node.matches(TweetImageSelector)) {
		visitOnce(node, () => {
			addImageControls(node.closest(".tweet, .Tweet"),node);
		})
	}
	
	if(node.matches(TweetVideoSelector)) {
		// we match an iframe here. once on the parent because iframes get reloaded when scrolling
		visitOnce(node.parentElement, () => {
			addVideoControls(node.closest(".tweet"), node)
		})
	}
}

function controlContainer(target) {
	let div = target.querySelector(`.${cssPrefix}-thumbs-container`);
	if(!div) {
		div = document.createElement("div")
		target.appendChild(div)
		div.className = prefixed("-thumbs-container")
	}		
	
	return div;
}

function addImageControls(tweetContainer, image) {
	let src = image.src;
	let origSrc = src + ":orig"
	
	let div = controlContainer(tweetContainer);
	
	div.insertAdjacentHTML("beforeend", `
			<a class="${cssPrefix}-orig-link" data-${cssPrefix}-small="${src}" href="${origSrc}"><img class="${cssPrefix}-thumb" src="${src}"></a>
	`)
}

const supportedContentTypes = [
		{
			// https://twitter.com/age_jaco/status/623712731456122881/photo/1
			matcher: (config) => config.content_type == "video/mp4",
			ext: "mp4",
			loader:	fetchMP4
		},
		{
			// https://twitter.com/MrNobre/status/754144048529625088
			matcher: (config) => config.content_type == "application/x-mpegURL",
			ext: "ts",
			loader: fetchMpegTs
		},{
			// https://twitter.com/mkraju/status/755368535619145728
			matcher: (config) => "vmap_url" in config,
			ext: "mp4",
			loader: fetchVmap
		}
]

// can't use fetch() API here since it's blocked by CSP
function fetchVmap(configPromise) {
	return configPromise.then(config => {
		return new Promise((resolve, reject) => {
			GM_xmlhttpRequest({
				method: "GET",
				url: config.vmap_url,
				responseType: "xml",
				anonymous: true,
				onload: (rsp) => { resolve(rsp.responseXML) },
				onerror: (e) => {	reject(e)	}
			})
		})
	}).then(xmlDoc => {
		let url = xmlDoc.querySelector("*|MediaFile").textContent;
		return new Promise((resolve, reject) => {
			GM_xmlhttpRequest({
				method: "GET",
				url: url,
				responseType: "blob",
				anonymous: true,
				onload: (rsp) => { resolve(rsp.response) },
				onerror: (e) => {	reject(e)	}
			})
		})
	})
}

function fetchMpegTs(configPromise) {
	let baseURL = null;
	
	return configPromise.then(config => {
		baseURL = config.video_url
		
		return fetch(config.video_url, {redirect: "follow", mode: "cors"}).then((response) => {
			return response.text()
		})
	}).then((playlist) => {
		let highestResolution = playlist.split(/\n/).filter(str => !str.startsWith("#")).filter(str => str.length > 0).pop()
		let fetchUrl = new URL(baseURL)
		fetchUrl.pathname = highestResolution
		return fetch(fetchUrl, {mode: "cors", redirects: "follow"});
	}).then((response) => {
		return response.text()
	}).then((chunkList) => {
		return chunkList.split(/\n/).filter(s => !s.startsWith("#")).filter(s => s.length > 0).map(chunk => {
			let u = new URL(baseURL);
			u.pathname = chunk;
			return u;
		})
	}).then((urls) => {
		return Promise.all(urls.map(u => {
			return fetch(u.toString(), {mode: "cors", redirects: "follow"}).then(response => response.blob())
		}));
	}).then(blobs => {
			return new Blob(blobs);
	})
}

function fetchMP4(configPromise) {
	return configPromise.then(config => {
		return fetch(config.video_url, {redirect: "follow", mode: "cors"}).then(response => response.blob())
	})
}


function addVideoControls(tweetContainer, iframe) {
	
	let mediaConfig = null;
	
	let configPromise = new Promise((resolve, reject) => {
		if(iframe.contentDocument.readyState == "interactive" || iframe.contentDocument.readyState == "complete") {
			resolve(iframe.contentDocument)
			return;
		}
		
		iframe.addEventListener("load", () => resolve(iframe.contentDocument))
	}).then((contentDoc) => {
		let config = JSON.parse(contentDoc.querySelector(".player-container").dataset.config)
		
		mediaConfig = config;
		
		console.log(config)
		
		
		
		if(!supportedContentTypes.find(t => t.matcher(config)))
			throw new Error(`unknown video configuration, unable to fetch data`);
		
		return config
	})
	
	const controls = controlContainer(tweetContainer)
	
	controls.insertAdjacentHTML("beforeend", `
		<a download="${Date.now()}.ts" href="#">download</a><span class="${cssPrefix}-progress"></span>
	`)
	
	let finalBlob = null;	
	const link = controls.querySelector("a[download]");
	
	let exceptionHandler = (message) => {
		return (exception) => {
			controls.insertAdjacentHTML("beforeend", `
					<span class="${cssPrefix}-error">
						${message}:
						${exception.toString()}
					</span>
				`)
		}
	}
	
	configPromise.catch(exceptionHandler("An error occured while reading the video metadata"))
	
	configPromise.then(config => {
		const type = supportedContentTypes.find(t => t.matcher(config))
		
		let filename = `@${config.user.screen_name} ${config.tweet_id}.${type.ext}`
		link.download = filename;
		link.appendChild(document.createTextNode(": " + filename))
	})
	
	
	link.addEventListener("click", (e) => {
		if(finalBlob != null)
			return;
		
		e.preventDefault();
		
		configPromise.then(config => {
			const type = supportedContentTypes.find(t => t.matcher(config))
			return type.loader(configPromise)
			
		}).then(blob => {
			finalBlob = blob;
			
			link.href = URL.createObjectURL(finalBlob);

			// fire new click event since we prevent-defaulted it earlier
			link.click();
		}).catch(exceptionHandler("An error occurred while downloading the video"))
				
	})
}

let observer = null 

function init() {
	const config = { subtree: true, childList: true };
	
	observer = new MutationObserver(mutationObserverCallback);
	observer.observe(document.documentElement, config);
	
	document.addEventListener("DOMContentLoaded", ready)
	document.addEventListener("click", thumbToggle)
	
} 

function thumbToggle(event) {
	if(event.button != 0)
		return;
	let link = event.target.closest(`.${cssPrefix}-orig-link`); 
	if(!link)
		return;
	let img = link.querySelector("img");

	event.preventDefault();
	
	if(link.classList.contains(prefixed("-expanded"))) {
		img.src = link.dataset[cssPrefix + "Small"]
		img.classList.add(prefixed("-thumb"))
		link.classList.remove(prefixed("-expanded"))
	} else {
		img.src = link.href;
		
		let f = () => {
			link.classList.add(prefixed("-expanded"))
			img.classList.remove(prefixed("-thumb"))
			img.removeEventListener("load", f)
		}
		
		img.addEventListener("load", f)
	}
	
	
}

function ready() {
	document.head.insertAdjacentHTML("beforeend", `
			<style>
				/* mobile */
				section.Timeline {
					overflow: visible;
				} 
				
				.${cssPrefix}-thumbs-container {
					display: flex;
					flex-wrap: wrap;
					justify-content: center;
				}
			
				a.${cssPrefix}-orig-link {
					padding: 5px;
				} 
			
				.${cssPrefix}-orig-link img.${cssPrefix}-thumb {
					max-width: 60px;
					max-height: 60px;
					vertical-align: middle;
				}
				

				
				a.${cssPrefix}-expanded {
					width: -moz-fit-content;
					width: fit-content;
				}
				
				a.${cssPrefix}-expanded img {
					width: -moz-fit-content;
					width: fit-content;
					max-width: 95vw;
				} 
			</style>
	`)
}

init();