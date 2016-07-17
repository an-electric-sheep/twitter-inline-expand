// ==UserScript==
// @name        Twitter Inline Expansion
// @namespace   https://github.com/an-electric-sheep/
// @description Inline-expansion of :orig (full-resolution) twitter images
// @match       *://*.twitter.com/*
// @version     0.1
// @run-at			document-start
// @noframes
// @grant       none
// ==/UserScript==

'use strict';

const cssPrefix = "mediatweaksuserscript"

// normal + mobile page
const TweetImageSelector = `
	.tweet .js-adaptive-media-container img ,
	.Tweet .CroppedPhoto img
`
	
	
function prefixed(str) {
	return cssPrefix + str;	
}
	
let alreadyVisited = new WeakSet()

function mutationObserverCallback(mutations) {
	setTimeout(() => {
		try {
			console.log(mutations)
			for(let mutation of mutations) {
				if(mutation.type != "childList")
					continue;
				for(let node of mutation.addedNodes) {
					if(node.nodeType != Node.ELEMENT_NODE)
						continue;
					onAddedNode(node)
					for(let subNode of node.querySelectorAll(TweetImageSelector))
						onAddedNode(subNode)
				}
			}
		} catch(e) {
			console.log(e)
		}
	}, 1)
}

function onAddedNode(node) {
	if(node.matches(TweetImageSelector)) {
		if(!alreadyVisited.has(node)) {
			alreadyVisited.add(node)
			addControls(node.closest(".tweet, .Tweet"),node)
		}
	}
			
			
}

function addControls(target, image) {
	let src = image.src;
	let origSrc = src + ":orig"
	
	let div = target.querySelector(`.${cssPrefix}-thumbs-container`);
	if(!div) {
		div = document.createElement("div")
		target.appendChild(div)
		div.className = `${cssPrefix}-thumbs-container`
	}
	
	div.insertAdjacentHTML("beforeend", `
			<a class="${cssPrefix}-orig-link" data-${cssPrefix}-small="${src}" href="${origSrc}"><img class="${cssPrefix}-thumb" src="${src}"></a>
	`)
}

let observer = null 

function init() {
	const config = { subtree: true, childList: true };
	
	observer = new MutationObserver(mutationObserverCallback);
	observer.observe(document, config);
	
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