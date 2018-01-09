console.log("script launched");
const hypertopic = require('hypertopic');
const getStdin = require('get-stdin');

let bufferTextNode,
	bufferHighlights,
	bufferTextOffset,
	bufferAllFragCoords = [],
	bufferSubFragParts = [],
	db = hypertopic([
  "http://argos2.hypertopic.org",
  "http://steatite.hypertopic.org"
]);

const errorHandler = function (error){ error => console.error(error)};

const getItemsTable = async (url) => {
	const itemsWithUrl = await db.getView(`/item/?resource=${url}`);
	return itemsWithUrl[Object.keys(itemsWithUrl)]; //items without URL
}

//Param : item {corpus : string , id : number}
//Output : array of HighlightsTable
const getHighlightsTable = async (item) => {
	return db.getView(`/item/${item.corpus}/${item.id}`);
}

//param must be an item {corpus : string , id : number}
const updateBufferHighlights = async (url) => {
	try{
	const itemsTable = await getItemsTable(url);
	const highlightsArray = [];
	if (itemsTable) {
		const itemsKeyTable = Object.keys(itemsTable); // Keys of items for this webpage
		for (let itemKey of itemsKeyTable) {
			for (let item of itemsTable[itemKey]) {
				let currentHighlightsArray = await getHighlightsTable(item);
				if (Object.keys(currentHighlightsArray[item.corpus][item.id]).length > 2) { //it means that if there is fragments 
					//remove non fragments part
					delete currentHighlightsArray[item.corpus][item.id]['resource'];
					delete currentHighlightsArray[item.corpus][item.id]['thumbnail'];
					for (fragments in currentHighlightsArray[item.corpus][item.id]) {
						highlightsArray.push(currentHighlightsArray[item.corpus][item.id][fragments]);
					}
				}
			}
		}
	}
	bufferHighlights = highlightsArray;
	}catch(e){errorHandler(e)}
}

const getTreeWalker = async () => {
	return document.createTreeWalker(
		document.body,
		NodeFilter.SHOW_TEXT,
		{acceptNode: node => {
			// only get text content
			if(node.nodeType != 3 || node.textContent.length == 0)
				return NodeFilter.FILTER_REJECT;
			// Filter the <script> content
			let m_parent = node.parentNode;
			if(m_parent && (m_parent.tagName == "SCRIPT"))
				return NodeFilter.FILTER_REJECT;
			return NodeFilter.FILTER_ACCEPT;
	        }
      	},
      	false
    );
}

const updateTextNode = async () => {
	const nodes = [];
	let val = ``,
		actualNode,
		nodeText;
	try{
		let treeWalker = await getTreeWalker();
		while (treeWalker.nextNode()){
			nodeText = treeWalker.currentNode.textContent;
			nodes.push({
			    start: val.length,
			    end: (val += '' + nodeText).length, 
			    text : nodeText,
			    fullNode : treeWalker.currentNode,
			    parentNode : treeWalker.currentNode.parentNode
	    	});
		}
	bufferTextNode = nodes;
	}catch(e){errorHandler(e)}
}

//The aim of this function is to create an array containing all section of text between each fragments coordinates
//It means each portion of text highlighted, highlighted in different colors at the same time and non highlighted parts
//of the text between highlighted portions of text
//The array will contains coordinates of the text's part and all the viewpoints and topics referring to it.
const updateSubFragParts = async () => {
	let allFragCoordinatesSet = new Set(); //We create a set to remove duplicates value
	bufferHighlights.forEach(highlight => {
		allFragCoordinatesSet.add(highlight.coordinates[0][0]);
		allFragCoordinatesSet.add(highlight.coordinates[0][1]);
	});
	bufferAllFragCoords = [...allFragCoordinatesSet]; 
	bufferAllFragCoords.sort((a,b) => a-b);
	let tempSubFrag;
	bufferSubFragParts = []; //The array we'are looking for.
	for (let i = 0; i <= bufferAllFragCoords.length-2 ; i++) {
		let tempViewpoints = new Set();
		let tempTopics = new Set();
		bufferHighlights.forEach(highlight => {
			if(highlight.coordinates[0][0] <= bufferAllFragCoords[i] && bufferAllFragCoords[i+1] <= highlight.coordinates[0][1]){
				tempViewpoints.add(highlight.topic[0][`viewpoint`]);
				tempTopics.add(highlight.topic[0][`id`])
			}
		});
		bufferSubFragParts.push({beginIndex: bufferAllFragCoords[i], endIndex: bufferAllFragCoords[i+1], viewpoints:tempViewpoints, topics:tempTopics});
	}
}

const colorHighlights = async (viewpoints) => {

}

const showHighlights = async () => {
	let element,
	remplacementNode,
	i = 0,
	j = 0;
	console.log(bufferSubFragParts);
	console.log(bufferTextNode);

	//For each text node of the page's body
	while (j < bufferTextNode.length){
		// We check if everything has been highlighted
		if (i >= bufferSubFragParts.length) {
			break;
		}
		textNode = bufferTextNode[j];
		//This it allow us to pass all  text nodes before the first highlight
		absNodeEnd = textNode.end - textNode.start;
		//if (textNode.end > bufferSubFragParts[0].beginIndex && i < bufferSubFragParts.length) {

		absFragStart = bufferSubFragParts[i].beginIndex - textNode.start;
		absFragEnd = bufferSubFragParts[i].endIndex - textNode.start;

		//If we have to interact with the node
		if (textNode.end > bufferSubFragParts[0].beginIndex) {
			
			remplacementNode = document.createElement(textNode.fullNode.parentNode.nodeName); //chercher à récupérer le type de node initial
			
			//Here to color in the good color
			element = document.createElement("mark");

			// If the subfragment cover all the node
			if (absFragStart <= 0 && absFragEnd >= absNodeEnd) {
				element.textContent = textNode.text.substring(absFragStart,absNodeEnd);
				remplacementNode.appendChild(element);
				textNode.fullNode.parentNode.parentNode.replaceChild(remplacementNode,textNode.fullNode.parentNode);
				if (absFragStart == 0 && absFragEnd == absNodeEnd){
					i++;
					while( bufferSubFragParts[i].viewpoints.size == 0){
						i++;
					}
					absFragStart = bufferSubFragParts[i].beginIndex - textNode.start;
					absFragEnd = bufferSubFragParts[i].endIndex - textNode.start;
				}
			}
			else {
				//Do we have a fragment beginning in a previous node and end in this node
				if (absFragStart <= 0 && absFragEnd < absNodeEnd){
					element.textContent = textNode.text.substring(0,absFragEnd);
					remplacementNode.appendChild(element);
					i++;
					while( bufferSubFragParts[i].viewpoints.size == 0){
						i++;
					}
					absFragStart = bufferSubFragParts[i].beginIndex - textNode.start;
					absFragEnd = bufferSubFragParts[i].endIndex - textNode.start;
				}
				//While we have fragment(s) which begin in this node and end in this node
				while (absFragStart >= 0 && absFragEnd <= absNodeEnd) {
					element.textContent = textNode.text.substring(absFragStart,absFragEnd);
					remplacementNode.appendChild(element);
					i++;
					while( bufferSubFragParts[i].viewpoints.size == 0){
						i++;
					}
					absFragStart = bufferSubFragParts[i].beginIndex - textNode.start;
					absFragEnd = bufferSubFragParts[i].endIndex - textNode.start;
				}
				//Do we have a fragment beginning in this node and ending in an other node ?
				if (absFragStart >= 0 && absFragEnd > absNodeEnd) {
					element.textContent = textNode.text.substring(absFragStart,absNodeEnd);
					remplacementNode.appendChild(element);
				}
			}
		}
		else if (bufferSubFragParts[i].viewpoints.size = 0){
		}
		//}	
	j++;	
	}
}

const messageHandler = async (message) => {
	let returnMessage;
	//let selection = window.document.getSelection();
	switch(message.aim){
		case `showHighlights`:
			try{
				await updateBufferHighlights(message.data);
				console.log(bufferHighlights);
				await updateTextNode();
				await updateSubFragParts();
				await showHighlights();
				returnMessage = `Highlighted`;
			} catch(e){errorHandler(e)}
		break;
		case `getAllHighlights`:
			try{
				await updateBufferHighlights(message.data) //!
				returnMessage = bufferHighlights.length.toString();
			} catch(e){errorHandler(e)}
			
		break;
		case `scriptExecutionCheck`:
			returnMessage = "running";			
		break;
	}
  	return Promise.resolve({returnMessage: returnMessage});
}

browser.runtime.onMessage.addListener(messageHandler);