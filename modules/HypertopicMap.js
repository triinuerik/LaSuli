let EXPORTED_SYMBOLS = ["getUUID", "HtServers", "HtMap"];

const Exception = Components.Exception;
const Cc = Components.classes;
const Ci = Components.interfaces;
const Cu = Components.utils;
const include = Cu.import;

include("resource://lasuli/modules/XMLHttpRequest.js");
include("resource://lasuli/modules/Sync.js");
include("resource://gre/modules/devtools/Console.jsm");

const { require } = Cu.import("resource://gre/modules/commonjs/toolkit/require.js", {})
var base64 = require("sdk/base64");
var preferences =  require('sdk/preferences/service');

var HtServers = {};
var HtCaches = {};

function getObject(obj) {
  var self = JSON.parse(JSON.stringify(obj));
  for(var k in self)
  {
    if(typeof(self[k]) == "function" || k == "htMap")
      delete self[k];
    if(typeof(self[k]) == "object")
      self[k] = getObject(self[k]);
  }
  return JSON.parse(JSON.stringify(self));
}
function getUUID() {
  var uuidGenerator =
    Components.classes["@mozilla.org/uuid-generator;1"]
            .getService(Components.interfaces.nsIUUIDGenerator);
  var uuid = uuidGenerator.generateUUID();
  var uuidString = uuid.toString();

  return uuidString.replace('{', '').replace('}', '').replace(/-/gi, '');
}
function uniqueArray(b){
  var a = [];
  var l = b.length;
  for(var i=0; i<l; i++) {
    for(var j=i+1; j<l; j++) {
      // If this[i] is found later in the array
      if (b[i] === b[j])
        j = ++i;
    }
    a.push(b[i]);
  }
  return a;
}
function intersect(a1, a2) {
  var a = [];
  var l = a1.length;
  var l2 = a2.length;
  for(var i=0; i<l; i++) {
    for(var j=0; j<l2; j++) {
      if (a1[i] === a2[j])
        a.push(a1[i]);
    }
  }
  return uniqueArray(a);
}
function HtMap(baseUrl, user, pass) {
  var regexp = /(http|https):\/\/(\w+:{0,1}\w*@)?(\S+)(:[0-9]+)?(\/|\/([\w#!:.?+=&%@!\-\/]))?/;

  //Check the baseUrl is a correct URL
  if(!baseUrl || baseUrl === "" || !regexp.test(baseUrl))
  {
      throw URIError('baseUrl is not a vaildate URL!');
  }
  //If the baseUrl is not end with "/" append slash to the end.
  this.baseUrl = (baseUrl.substr(-1) == "/") ? baseUrl : baseUrl + "/";
  
  //Create the XMLHttpRequest object for HTTP requests
  this.xhr = new XMLHttpRequest();
  //Overrides the MIME type returned by the hypertopic service.
  this.xhr.overrideMimeType('application/json');

  this.user = user;
  this.pass = pass;
  this.serverType = this.getServerType();
  if(!this.serverType)
    return false;
  //Initialize the local cache
  HtCaches[baseUrl] = {};
  //Set to false to disable cache for debuging
  this.enableCache = preferences.get('extensions.lasuli.cache') || true;
}
HtMap.prototype.purgeCache = function(){
  HtCaches[this.baseUrl] = {};
}
HtMap.prototype.getServerType = function(){
  var result = this.httpGet('');
  if(typeof result['service'] == 'string')
    return result['service'].toLowerCase();
  return false;
}
HtMap.prototype.getLastSeq = function(){
  var result = this.httpGet('');
  return result.update_seq || false;
}

HtMap.prototype.getType = function() {
  return "HtMap";
}
/**
 * @param object null if method is GET or DELETE
 * @return response body
 */
HtMap.prototype.send = function(httpAction, httpUrl, httpBody) {
  //Default HTTP action is "GET"
  httpAction = (httpAction) ? httpAction : "GET";
  //cache is enabled
  if(this.enableCache)
  {
    if(typeof(HtCaches[this.baseUrl]) == "undefined")
      HtCaches[this.baseUrl] = {};

    //Is PUT/DELETE/POST action then clear the cache
    if(httpAction != 'GET')
      HtCaches[this.baseUrl] = {};
    else
      //Try to load from the cache
      if(typeof( HtCaches[this.baseUrl][httpUrl]) != "undefined")
      {
        return HtCaches[this.baseUrl][httpUrl];
      }
  }
  
  //Default HTTP URL is the baseUrl
  httpUrl = (httpUrl) ? httpUrl : this.baseUrl;
  //Uncomment the following line to disable cache

  httpBody = (!httpBody) ? "" : ((typeof(httpBody) == "object")
                                  ? JSON.stringify(httpBody) : httpBody);
  var result = null;
  console.time("HypertopicMap.send");
  try{
    this.xhr.open(httpAction, httpUrl, false);
    //If there is a request body, set the content-type to json
    if(httpBody && httpBody != '')
      this.xhr.setRequestHeader('Content-Type', 'application/json');
		
		this.xhr.setRequestHeader('Accept', 'application/json');

    if (this.user && this.pass) {
      var auth = "Basic " + base64.encode(this.user + ':' + this.pass);
      this.xhr.setRequestHeader('Authorization', auth);
    }

    //If the request body is an object, serialize it to json
    if(typeof(httpBody) != 'string')
      httpBody = JSON.stringify(httpBody);

    this.xhr.send(httpBody);
    console.timeEnd("HypertopicMap.send");
    //If the response status code is not start with "2",
    //there must be something wrong.
    if((this.xhr.status + "").substr(0,1) != '2')
    {
      throw Error(httpAction + " " + httpUrl + "\nResponse: " +this.xhr.status);
    }
    result = this.xhr.responseText;
    //Clear cache
    if(this.enableCache && httpAction != 'GET')
      this.purgeCache();

    try{
      if(typeof(result) == "string" && result.length > 0)
      {
        if(this.enableCache && httpAction == 'GET')
          HtCaches[this.baseUrl][httpUrl] = JSON.parse(result);
        return JSON.parse(result);
      }
    }catch(e){
      console.error(e, httpAction, httpUrl, result);
    }
    return true;
  }
  catch(e)
  {
    console.error(e, this.xhr.status, this.xhr.statusText, httpAction, httpUrl, httpBody);
    return false;
  }
}
/**
 * @param object The object to create on the server.
 *               It is updated with an _id (and a _rev if the
 *               server features conflict management).
 */
HtMap.prototype.httpPost = function(object) {
  var body;
  try{
    body = this.send("POST", null, object);
    if(!body || !body.ok)
    {
      console.trace(object);
      return false;
    }
  }
  catch(e)
  {
    console.error(e, object);
    return false;
  }

  //Get object id from response result.
  object._id = body.id;
  return object;
}
/**
 * Notice: In-memory parser not suited to long payload.
 * @param query the path to get the view from the baseURL
 * @return if the queried object was like
 * {rows:[ {key:[key0, key1], value:{attribute0:value0}},
 * {key:[key0, key1], value:{attribute0:value1}}]}
 * then the returned object is
 * {key0:{key1:{attribute0:[value0, value1...]}}}
 * otherwise the original object is returned.
 */
HtMap.prototype.httpGet = function(query) {
  var body;
  try{
    var url = this.baseUrl + query;
    body = this.send("GET", url, null);
    if(!body)
      return false;
  }catch(e)
  {
    console.error(e, query);
    return false;
  }

  if(body.rows && body.rows.length > 0)
  {
    var rows = body.rows;
    var result = {};
    for(var i=0; i < rows.length; i++)
    {
      var r = rows[i];
      var keys = (typeof(r.key) == "string") ? [r.key] : r.key;
      var current = result;
      for(var k=0; k < keys.length; k++)
      {
        if(!current[keys[k]])
          current[keys[k]] = {};
        current = current[keys[k]];
      }
      var value = r.value;
      for(var attribute in value)
      {
        if(!current[attribute])
          current[attribute] = [];
        current[attribute].push(value[attribute]);
      }
    }
    body = result;
  }
  return body;
}
/**
 * @param object the object to update on the server
 * (_id is mandatory, the server may need _rev for conflict management)
 * if the server features conflict management, the object is updated with _rev
 */
HtMap.prototype.httpPut = function(object) {
  var url = this.baseUrl + object._id;
  try{
    var body = this.send("PUT", url, object);
    if(!body)
      throw Error(JSON.stringify(object));
  }catch(e)
  {
    console.error(e, url, object);
    return false;
  }
  return object;
}
/**
 * @param object the object to delete on the server
 * (_id is mandatory, the server may need _rev for conflict management)
 */
HtMap.prototype.httpDelete = function(object) {
  var url;
  if(typeof(object) == "string")
    url = this.baseUrl + object;
  else
  {
    url = this.baseUrl + object._id;
    if(object._rev)
      url += "?rev=" + object._rev;
  }

  try{
    var body = this.send("DELETE", url, null);
    if(!body)
      throw Exception(JSON.stringify(object));
  }catch(e)
  {
    console.error(e, url);
    return false;
  }
  return true;
}

HtMap.prototype.getUser = function(userID) {
  userID = userID || this.user;
  return new HtMapUser(userID, this);
}

HtMap.prototype.getCorpus = function(corpusID) {
  return new HtMapCorpus(corpusID, this);
}

HtMap.prototype.getItem = function(obj) {
  if(typeof(obj) == "string")
  {
    var item = this.httpGet("item/?resource=" + encodeURIComponent(obj));
    if(!item || !item[obj] || !item[obj].item || !(item[obj].item.length > 0))
      return false;
    obj = item[obj].item[0];
  }
  var corpus = 	this.getCorpus(obj.corpus);
  return corpus.getItem(obj.id);
}

HtMap.prototype.getViewpoint = function(viewpointID) {
  return new HtMapViewpoint(viewpointID, this);
}

HtMap.prototype.getTopic = function(topic) {
  var viewpoint = this.getViewpoint(topic.viewpoint);
  return viewpoint.getTopic(topic);
}

HtMap.prototype.getHighlight = function(highlight) {
  var corpus = this.getCorpus(highlight.corpus);
  if(!corpus) return false;
  var item = corpus.getItem(highlight.item);
  if(!item) return false;
  return item.getHighlight(highlight.id);
}

HtMap.prototype.isReserved = function(key) {
	var reserved = {"highlight": null, "name": null, "resource": null,
	  "thumbnail": null, "topic": null, "upper": null, "user": null };
	return (key in reserved);
}

function HtMapUser(id, htMap) {
  this.id = id;
  this.htMap = htMap;
}

HtMapUser.prototype.getType = function() {
  return "HtMapUser";
}

HtMapUser.prototype.getID = function() {
  return this.id;
}

HtMapUser.prototype.getObject = function() { return getObject(this); }

HtMapUser.prototype.getView = function() {
  var ret = this.htMap.httpGet("user/" + this.getID());
  return (ret && ret[this.getID()]) ? ret[this.getID()] : false;
}

HtMapUser.prototype.listCorpora = function() {
  var view = this.getView();
  if(!view) return false;
  return view.corpus;
}

/**
 * @return a list of IDs and names pairs... fast!
 */
HtMapUser.prototype.listViewpoints = function() {
  var view = this.getView();
  if(!view) return false;
  return view.viewpoint;
}

HtMapUser.prototype.createCorpus = function(name) {
  var corpus = {};
  corpus.corpus_name = name;
  corpus.users = new Array(this.getID());
  var ret = this.htMap.httpPost(corpus);
  if(!ret) return false;
  return this.htMap.getCorpus(ret._id);
}

HtMapUser.prototype.createViewpoint = function(name) {
  var viewpoint = {};
  viewpoint.viewpoint_name = name;
  viewpoint.users = new Array(this.getID());
  var ret = this.htMap.httpPost(viewpoint);
  if(!ret) return false;
  return this.htMap.getViewpoint(ret._id);
}

function HtMapCorpus(id, htMap) {
  this.id = id;
  this.htMap = htMap;
}
HtMapCorpus.prototype.getType = function() {
  return "HtMapCorpus";
}
HtMapCorpus.prototype.getID = function() {
  return this.id;
}

HtMapCorpus.prototype.getObject = function() { return getObject(this); }

HtMapCorpus.prototype.getView = function() {
  var ret = this.htMap.httpGet("corpus/" + this.getID());
  return (ret && ret[this.getID()]) ? ret[this.getID()] : false;
}
HtMapCorpus.prototype.getRaw = function() {
  return this.htMap.httpGet(this.getID());
}
HtMapCorpus.prototype.createWithID = function(corpusID, name) {
  var corpus = {};
  corpus._id = corpusID;
  corpus.corpus_name = name || corpusID;
  var ret = this.htMap.httpPost(corpus);
  if(!ret) return false;
  return this.htMap.getCorpus(ret._id);
}
HtMapCorpus.prototype.register = function(user) {
  var userID = (typeof(user) == "object") ? user.getID() : user;
  var corpus = this.htMap.httpGet(this.getID());
  if(!corpus) return false;
  if(!corpus.users) corpus.users = new Array();
  corpus.users.push(userID);
  this.htMap.httpPut(corpus);
}

HtMapCorpus.prototype.unregister = function(user) {
  var corpus = this.htMap.httpGet(this.getID());
  if(!corpus) return false;
  if(!corpus.users) return true;
  for(var i=0, el; el = corpus.users[i]; i++)
    if(el == user.getID())
    {
      corpus.users.splice(i, 1);
      i--;
    }

	this.htMap.httpPut(corpus);
}

HtMapCorpus.prototype.listUsers = function() {
  var view = this.getView();
  if(!view) return false;
  return (view.user) ? view.user : {};
}

/**
 * @return whole items contained in the corpus
 */
HtMapCorpus.prototype.getItems = function() {
  var view = this.getView();
  if(!view) return false;
  var result = new Array();
  for(var key in view)
    if(!this.htMap.isReserved(key))
    {
      result.push(this.getItem(key));
    }
  return result;
}

HtMapCorpus.prototype.rename = function(name) {
  var ret = this.htMap.httpGet(this.getID());
  if(!ret) return false;
  ret.corpus_name = name;
  return this.htMap.httpPut(ret);
}

HtMapCorpus.prototype.getName = function() {
  var corpus = this.getView();
  if(!corpus || !corpus.name) return false;
  return corpus.name[0];
}

/**
 * Destroy the nodes of the corpus and of all its documents.
 */
HtMapCorpus.prototype.destroy = function() {
	var items = this.getItems();
	if(!items) return true;
	for (var i=0, item; item = items[i]; i++) {
		item.destroy();
	}
	var corpus = this.htMap.httpGet(this.getID());
	var ret = this.htMap.httpDelete(corpus);
	if(!ret) return false;
	return true;
}


HtMapCorpus.prototype.createItem = function(name, itemID) {
  var item = {
    "item_name": name,
    "item_corpus": this.getID()
  };
  var ret;
  if(itemID) 
  {  
    item._id = itemID;
    ret = this.htMap.httpPut(item);
  }
  else
    ret = this.htMap.httpPost(item);
  if(!ret) return false;
  return this.getItem(ret._id);
}

HtMapCorpus.prototype.getItem = function(itemID) {
  return new HtMapItem(itemID, this);
}

function HtMapItem(itemID, Corpus) {
  this.Corpus = Corpus;
  this.id = itemID;
}
HtMapItem.prototype.getType = function() {
  return "HtMapItem";
}
HtMapItem.prototype.getID = function() {
  return this.id;
}

HtMapItem.prototype.getObject = function() { return getObject(this); }

HtMapItem.prototype.getView = function() {
  var corpusID = this.getCorpusID();
  var itemID = this.getID();
  var view = this.Corpus.htMap.httpGet("item/" + corpusID + "/" + itemID);
  return (!view || typeof(view[corpusID]) != "object" || typeof(view[corpusID][itemID]) != "object") ? false : view[corpusID][itemID];
}

HtMapItem.prototype.getRaw = function() {
  return this.Corpus.htMap.httpGet(this.getID());
}

HtMapItem.prototype.getName = function() {
  var item = this.getView();
  return (item && item.name) ? item.name[0] : false;
}

HtMapItem.prototype.getCorpusID = function() {
  return this.Corpus.getID();
}

HtMapItem.prototype.destroy = function() {
	var item = this.getRaw();
	var ret = this.Corpus.htMap.httpDelete(item);
	if(!ret) return false;
	return true;
}

HtMapItem.prototype.getResource = function() {
	var view = this.getView();
  if(!view) return false;
	return (!view || !view.resource) ? false : view.resource[0];
}

HtMapItem.prototype.getAttributes = function() {
  var item = this.getView();
  if(!item) return false;
  var reserved = {"highlight": null, "resource": null, "thumbnail": null,
    "topic": null, "corpus": null, "speeches": null, "name": null };
  var result = new Array();
  for(var key in item)
    if(!(key in reserved) && !item[key].hasOwnProperty("coordinates"))
      result.push({"name": key, "value": item[key]});
  return result;
}

HtMapItem.prototype.getTopics = function() {
  var view = this.getView();
  if(!view) return false;
  var result = new Array();
  if(view.topic)
    for(var topic, i=0; topic = view.topic[i]; i++)
      result.push(this.Corpus.htMap.getTopic(topic));
  return result;
}

HtMapItem.prototype.rename = function(name) {
  var item = this.Corpus.htMap.httpGet(this.getID());
  if(!item) return false;
  item.item_name = name;
  return this.Corpus.htMap.httpPut(item);
}

HtMapItem.prototype.describe = function(attribute, value) {
  var item = this.Corpus.htMap.httpGet(this.getID());
  if(!item) return false;
  if(!item[attribute])
    item[attribute] = value;
  else
    if(typeof(item[attribute]) == "string")
      item[attribute] = new Array(item[attribute], value);
    else
      if(item[attribute] instanceof Array && item[attribute].indexOf(value) < 0)
        item[attribute].push(value);
  return this.Corpus.htMap.httpPut(item);
}

HtMapItem.prototype.undescribe = function(attribute, value) {
  var item = this.Corpus.htMap.httpGet(this.getID());
  if(!item) return false;
  if(!item[attribute]) return true;
  if(typeof(item[attribute]) == "string" && item[attribute] == value)
    delete item[attribute];
  else
    if(item[attribute] instanceof Array && item[attribute].indexOf(value) > -1)
      for(var i=0, attr; attr = item[attribute][i]; i++)
        if(attr == value)
        {
          item[attribute].splice(i, 1);
          i--;
        }

  return this.Corpus.htMap.httpPut(item);
}

HtMapItem.prototype.tag = function(topic) {
  var item = this.Corpus.htMap.httpGet(this.getID());
  if(!item) return false;
  if(!item.topics) item.topics = {};
  item.topics[topic.getID()] = {"viewpoint": topic.getViewpointID() };
  return this.Corpus.htMap.httpPut(item);
}

HtMapItem.prototype.untag = function(topic) {
  var item = this.Corpus.htMap.httpGet(this.getID());
  if(!item) return false;
  if(!item.topics) return true;
  if(item.topics && item.topics[topic.getID()])
    delete item.topics[topic.getID()];

  var i=0;
  for (var t in item.topics) {
    i++;
  }
  if(i == 0) delete item.topics;
  return this.Corpus.htMap.httpPut(item);
}

HtMapItem.prototype.createHighlight = function(topic, text, coordinates) {
  var obj;
  if(this.Corpus.htMap.serverType  == "argos")
  {
    obj = this.getRaw();
  }
  else
    obj = this.Corpus.getRaw();

  if(!obj) return false;
  if(!obj.highlights) obj.highlights = {};

  var id = getUUID();
  obj.highlights[id] = {
    "coordinates" : coordinates,
    "text": text,
    "viewpoint": topic.getViewpointID(),
    "topic": topic.getID()
  };
  var ret = this.Corpus.htMap.httpPut(obj);

  if(!ret) return false;
  return this.getHighlight(id);
}

HtMapItem.prototype.getHighlights = function() {
	var result = new Array();
	var view = this.getView();
	/*if(!view.highlight || view.highlight.length == 0) return result;
    for(var i=0, highlight; highlight = view.highlight[i]; i++)
      result.push(new HtMapHighlight(highlight.id, this));*/
	for (var k in view) {
	  if(!view.hasOwnProperty(k)) continue;
	  if (!this.Corpus.htMap.isReserved(k) && typeof view[k] == "object" 
		  && view[k].hasOwnProperty("coordinates")) 
		  result.push(new HtMapHighlight(k, this));
	}
	return result;
}

HtMapItem.prototype.getHighlight = function(highlightID) {
  return new HtMapHighlight(highlightID, this);
}

function HtMapHighlight(highlightID, item) {
  this.id = highlightID;
  this.Item = item;
}
HtMapHighlight.prototype.getType = function() {
  return "HtMapHighlight";
}
HtMapHighlight.prototype.getID = function() {
  return this.id;
}

HtMapHighlight.prototype.getObject = function() { return getObject(this); }

HtMapHighlight.prototype.getView = function() {
  var view = this.Item.getView();
  return view[this.getID()] || false;
}

HtMapHighlight.prototype.getItemID = function() {
  return this.Item.getID();
}

HtMapHighlight.prototype.getCorpusID = function() {
  return this.Item.Corpus.getID();
}

HtMapHighlight.prototype.getTopic = function() {
  var view = this.getView();
  if(!view) return false;
  return (view.topic && typeof(view.topic[0]) == 'object') ? view.topic[0] : false;
}
HtMapHighlight.prototype.moveToTopic = function(topicID) {
  var item = this.Item.Corpus.htMap.httpGet(this.getItemID());
  if(!item) return false;
  if(!item.highlights && !item.highlights[this.getID()]) return false;
  item.highlights[this.getID()].topic = topicID;
  return this.Item.Corpus.htMap.httpPut(item);
}

HtMapHighlight.prototype.getText = function() {
  var view = this.getView();
  if(!view) return false;
  return (view.text) ? view.text + "" : false;
}

HtMapHighlight.prototype.getCoordinates = function() {
  var view = this.getView();
  if(!view) return false;
  return (typeof(view.coordinates[0]) == 'object') ? view.coordinates[0] : false;
}

HtMapHighlight.prototype.destroy = function() {
  var obj;
  if(this.Item.Corpus.htMap.serverType == "argos")
    obj = this.Item.Corpus.htMap.httpGet(this.getItemID());
  else
    obj = this.Item.Corpus.getRaw();

  if(!obj) return false;
  if(!obj.highlights && !obj.highlights[this.getID()]) return true;
  delete obj.highlights[this.getID()];
  return this.Item.Corpus.htMap.httpPut(obj);
}

function HtMapViewpoint(viewpointID, htMap) {
  this.id = viewpointID;
  this.htMap = htMap;
}
HtMapViewpoint.prototype.getType = function() {
  return "HtMapViewpoint";
}
HtMapViewpoint.prototype.getID = function() {
  return this.id;
}

HtMapViewpoint.prototype.getObject = function() { return getObject(this); }

HtMapViewpoint.prototype.getView = function() {
  var viewpoint = this.htMap.httpGet("viewpoint/" + this.getID());
  if(!viewpoint) return false;
  return viewpoint[this.getID()];
}

HtMapViewpoint.prototype.getRaw = function() {
  return this.htMap.httpGet(this.getID());
}

HtMapViewpoint.prototype.destroy = function() {
  var viewpoint = this.getRaw();
  if(!viewpoint) return false;
  return this.htMap.httpDelete(viewpoint);
}

HtMapViewpoint.prototype.register = function(user) {
  var viewpoint = this.getRaw();
  if(!viewpoint) return false;
  if(!viewpoint.users) viewpoint.users = new Array();
  viewpoint.users.push(user.getID());
  this.htMap.httpPut(viewpoint);
}

HtMapViewpoint.prototype.unregister = function(user) {
  var viewpoint = this.getRaw();
  if(!viewpoint) return false;
  if(!viewpoint.users) return true;
  for(var i=0, el; el = viewpoint.users[i]; i++)
    if(el == user.getID())
    {
      viewpoint.users.splice(i, 1);
      i--;
    }

	this.htMap.httpPut(viewpoint);
}

HtMapViewpoint.prototype.getName = function() {
  var viewpoint = this.getView();
  if(!viewpoint || !viewpoint.name) return false;
  return viewpoint.name[0];
}

HtMapViewpoint.prototype.getUpperTopics = function() {
  var result = new Array();
  var view = this.getView();
  if(!view) return false;
  if(!view.upper) return result;
  for(var i=0, topicID; topicID = view.upper[i]; i++)
    result.push(this.getTopic(topicID));
  return result;
}

HtMapViewpoint.prototype.getTopics = function() {
  var result = new Array();
  var view = this.getView();
  if(!view) return false;
  for(var k in view)
    if(!this.htMap.isReserved(k))
    {
      result.push(this.getTopic(k));
    }
  return result;
}

HtMapViewpoint.prototype.getItems = function() {
  var result = new Array();
  var topics = this.getTopics();
  for(var i=0, topic; topic = topics[i]; i++)
  {
    var items = topic.getItems();
    for(var j=0, item; item = items[j]; j++)
      result.push(item);
  }
  return result;
}

HtMapViewpoint.prototype.getHighlights = function() {
  var result = new Array();
  var topics = this.getTopics();
  var highlightIDs = {};
  for(var i=0, topic; topic = topics[i]; i++)
  {
    var highlights = topic.getHighlights(false);
    for(var j=0, highlight; highlight = highlights[j]; j++)
      if(!(highlight.id in highlightIDs))
      {
        highlightIDs[highlight.id] = {};
        result.push(highlight);
      }
  }
  return result;
}

HtMapViewpoint.prototype.listUsers = function() {
  var view = this.getView();
  if(!view) return false;

  return (view.user) ? view.user : (new Array());
}

HtMapViewpoint.prototype.rename = function(name) {
  var viewpoint = this.getRaw();
  if(!viewpoint) return false;
  viewpoint.viewpoint_name = name;

	return this.htMap.httpPut(viewpoint);
}

HtMapViewpoint.prototype.createTopic = function(broaderTopics, name) {
  var topicID = getUUID();

  var viewpoint = this.getRaw();
  if(!viewpoint) return false;

  var broader = new Array();
  if(broaderTopics)
  {
    if(typeof(broaderTopics.length) != "number")
      broaderTopics = new Array(broaderTopics);

    for(var i=0, topic; topic = broaderTopics[i]; i++)
      if(typeof(topic) == "string")
        broader.push(topic);
      else
        broader.push(topic.getID());

  }
  if(!viewpoint.topics)
    viewpoint.topics = {};

  viewpoint.topics[topicID] = {
    "broader": broader,
    "name": name
  };

	var ret = this.htMap.httpPut(viewpoint);
	if(!ret) return false;
	return this.getTopic(topicID);
}

HtMapViewpoint.prototype.getTopic = function(topic) {
  if(typeof(topic) == "string")
    return new HtMapTopic(topic, this);
  else
    return new HtMapTopic(topic.id, this);
}

HtMapViewpoint.prototype.createGeneralTopic = function(topics, name) {
  name = name || 'no name';

  var shares;
  for(var i=0, topic; topic = topics[i]; i++) {
    var topic = this.getTopic(topic);
    var broaders = topic.getBroaders();
    if(!shares)
      shares = broaders
    else{
      shares = intersect(shares, broaders);
    }
    
    if(shares.length == 0)
      break;
  }
  var parent;
  if(shares.length > 0)
    parent = this.createTopic(new Array(shares[0]), name);
  else
    parent = this.createTopic(false, name);
  if(!parent) return false;
  var children = new Array();
  for(var i=0, topic; topic = topics[i]; i++) {
    children.push(this.getTopic(topic));
  }
  parent.moveTopics(children);
  return this.getTopic(parent.getID());
}

function HtMapTopic(topicID, viewpoint) {
  this.id = topicID;
  this.Viewpoint = viewpoint;
}
HtMapTopic.prototype.getType = function() {
  return "HtMapTopic";
}
HtMapTopic.prototype.getID = function() {
  return this.id;
}

HtMapTopic.prototype.getObject = function() { return getObject(this); }

HtMapTopic.prototype.getViewpointID = function() {
  return this.Viewpoint.getID();
}

HtMapTopic.prototype.getView = function() {
  var viewpoint = this.Viewpoint.getView();
  if(!viewpoint) return false;
  return viewpoint[this.getID()];
}

HtMapTopic.prototype.getName = function() {
  var topic = this.getView();
  if(!topic || !topic.name) return false;
  return (topic.name && topic.name[0])
            ? topic.name[0] : '';
}

/**
 * @return list
 */
HtMapTopic.prototype.getNarrower = function() {
  var result = new Array();
  var view = this.getView();
  if(!view) return false;
  var narrower = view.narrower;
  if(!narrower) return false;
  for (var topic of narrower) {
    result.push(this.Viewpoint.getTopic(topic));
  }
  return result;
}

/**
 * @return list
 */
HtMapTopic.prototype.getBroader = function() {
  var result = new Array();
  var view = this.getView();
  if(!view) return false;
  var broader = view.broader;
  for (var topic of broader) {
    result.push(this.Viewpoint.getTopic(topic));
  }
  return result;
}

HtMapTopic.prototype.getBroaders = function() {
  var result = new Array();
  var broaders = this.getBroader();
  for(var i=0, topic; topic = broaders[i]; i++){
    result.push(topic.getID());
    result = result.concat(topic.getBroaders());
  }
  return result;
}


/**
 * Recursive. Could be optimized with a cache.
 * Precondition: narrower topics graph must be acyclic.
 */
HtMapTopic.prototype.getItems = function() {
	var result = new Array();
  var topic = this.getView();
  if(!topic) return false;
  if(topic.item)
  	for (var item of topic.item) {
  		result.push(
  			this.Viewpoint.htMap.getItem(item)
  		);
  	}
	var narrower = topic.narrower;
	if(narrower)
    for(var i=0, nTopic; nTopic = narrower[i]; i++)
    {
      var topic = this.Viewpoint.getTopic(nTopic);
      var items = topic.getItems();
      if(!items) continue;
      for(var j=0, item; item = items[j]; j++)
      {
        result.push(item);

      }
    }
	return result;
}

HtMapTopic.prototype.getHighlights = function(recursion) {
	var result = new Array();
  var topic = this.getView();
  if(!topic) return false;
  if(topic.highlight instanceof Array)
  	for(var i=0, highlight; highlight = topic.highlight[i]; i++) {
  		result.push(
  			this.Viewpoint.htMap.getHighlight(highlight)
  		);
  	}
	if(!recursion) return result;

	var narrower = topic.narrower;
  for (var t of narrower)
  {
    var topic = this.Viewpoint.getTopic(t[1]);
    var highlights = topic.getHighlights(true);
    if(!highlights) continue;
    for(var i=0, highlight; highlight = highlights[i]; i++)
      result.push(highlight);
  }
	return result;
}

HtMapTopic.prototype.rename = function(name) {
  var viewpoint = this.Viewpoint.htMap.httpGet(this.Viewpoint.getID());
  if(!viewpoint) return false;
  if(!viewpoint.topics || !viewpoint.topics[this.getID()] ) return false;
  viewpoint.topics[this.getID()].name = name;
	return this.Viewpoint.htMap.httpPut(viewpoint);
}

HtMapTopic.prototype.destroy = function() {
  var viewpoint = this.Viewpoint.htMap.httpGet(this.Viewpoint.getID());
  if(!viewpoint) return false;
  if(!viewpoint.topics) return false;
  var topicID = this.getID();
  if(!viewpoint.topics || !viewpoint.topics[topicID] ) return false;
  delete viewpoint.topics[topicID];
  for (var t of Iterator(viewpoint.topics)) {
    var topic = t[1];
    if(topic.broader && topic.broader instanceof Array)
      for(var i=0, t; t = topic.broader[i]; i++)
        if(t == topicID)
        {
          topic.broader.splice(i, 1);
          i--;
        }
  }
	return this.Viewpoint.htMap.httpPut(viewpoint);
}

HtMapTopic.prototype.moveTopics = function(narrowerTopics) {
  var viewpoint = this.Viewpoint.htMap.httpGet(this.Viewpoint.getID());
  if(!viewpoint) return false;
  if(!viewpoint.topics) return false;
  if(!(narrowerTopics instanceof Array))
    narrowerTopics = new Array(narrowerTopics);
  for(var i=0, nTopic; nTopic = narrowerTopics[i]; i++)
  {
    if(!viewpoint.topics || !viewpoint.topics[nTopic.getID()] ) return false;
    viewpoint.topics[nTopic.getID()].broader = new Array(this.getID());
  }
	return this.Viewpoint.htMap.httpPut(viewpoint);
}

/**
 * Unlink from broader topics
 */
HtMapTopic.prototype.unlink = function() {
  var viewpoint = this.Viewpoint.htMap.httpGet(this.Viewpoint.getID());
  if(!viewpoint) return false;
  if(!viewpoint.topics || !viewpoint.topics[this.getID()]) return false;
  viewpoint.topics[this.getID()].broader = new Array();
	return this.Viewpoint.htMap.httpPut(viewpoint);
}

HtMapTopic.prototype.linkTopics = function(narrowerTopics) {
  var viewpoint = this.Viewpoint.htMap.httpGet(this.Viewpoint.getID());
  if(!viewpoint) return false;
  if(!viewpoint.topics || !viewpoint.topics[this.getID()]) return false;
  for(var i=0, nTopic; nTopic = narrowerTopics[i]; i++)
  {
    if(!viewpoint.topics || !viewpoint.topics[nTopic.getID()] ) return false;
    if(!viewpoint.topics[nTopic.getID()].broader)
      viewpoint.topics[nTopic.getID()].broader = new Array();
    viewpoint.topics[nTopic.getID()].broader.push(this.getID());
  }
	return this.Viewpoint.htMap.httpPut(viewpoint);
}
