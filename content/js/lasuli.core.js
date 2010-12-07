include("resource://lasuli/modules/Observers.js");
include("resource://lasuli/modules/Preferences.js");
include("resource://lasuli/modules/log4moz.js");
include("resource://lasuli/modules/HypertopicMap.js");

lasuli.core = {
  fragments : {},

  //Open lasuli sidebar
  openSideBar : function(){
		if(!lasuli.core.isSidebarOpen()){
   		toggleSidebar('viewLaSuliSidebar', true);
  	}
	},
  closeSideBar : function(){
    if(lasuli.core.isSidebarOpen())
   		toggleSidebar('viewLaSuliSidebar', false);
  },
  //Get sidebar status
	isSidebarOpen : function(){
		return (document.getElementById("viewLaSuliSidebar").getAttribute("checked") == "true");
	},

	//Load setting from preferences
  loadSetting : function(){
    var logger = Log4Moz.repository.getLogger("lasuli.core.loadSetting");
    var prompts = Cc["@mozilla.org/embedcomp/prompt-service;1"]
                        .getService(Ci.nsIPromptService);
    var servers = Preferences.get("extensions.lasuli.setting", JSON.stringify(new Array()));
    if(typeof(servers) == "string")
      servers = JSON.parse(servers);

    HtServers = {};
    for(var i=0, server; server = servers[i]; i++)
    {
      var n = getUUID();
      if(server.default)
        n = "freecoding";
      //logger.trace(server);
      HtServers[n] = new HtMap(server.url, server.user, server.pass);
      if(typeof(HtServers[n].serverType) != "string")
      {
        prompts.alert(window, _('Error'), _('options.error.servernotaccessible',[server.url]));
        this.closeSideBar();
        return false;
      }
    }

    return true;
  },

  //Auto register all observers
  register: function(){
    var logger = Log4Moz.repository.getLogger("lasuli.core.register");
    logger.trace("start to register");
    for(var func in this)
      if(func.substr(0, 2) == "do")
        Observers.add("lasuli.core." + func, lasuli.core[func], lasuli.core);
  },
  unregister: function(){
    for(var func in this)
      if(func.substr(0, 2) == "do")
        Observers.remove("lasuli.core." + func, lasuli.core[func], lasuli.core);
  },

  doPrefChange : function(){
    var logger = Log4Moz.repository.getLogger("lasuli.core.doPrefChange");
    logger.level = Log4Moz.Level["Debug"];
    //reInitial HypertopicMap
    lasuli.core.loadSetting();
    if(lasuli.core.isSidebarOpen())
    {
      //logger.debug("sidebar reload");
      document.getElementById("sidebar").contentWindow.location.reload();
    }
  },

  // When tabWatcher find a new location is input, trigger this function
  doLocationChange: function(url){
    var logger = Log4Moz.repository.getLogger("lasuli.core.doLocationChange");
    //logger.debug("URL:" + url);
    if(!url){
      //logger.debug("URL is NULL");
      var mainWindow = window.QueryInterface(Components.interfaces.nsIInterfaceRequestor)
                   .getInterface(Components.interfaces.nsIWebNavigation)
                   .QueryInterface(Components.interfaces.nsIDocShellTreeItem)
                   .rootTreeItem
                   .QueryInterface(Components.interfaces.nsIInterfaceRequestor)
                   .getInterface(Components.interfaces.nsIDOMWindow);
      url = mainWindow.content.location.href;
      //logger.debug(url);
      url = (url.indexOf('#') > 0) ? url.substr(0, url.indexOf('#')) : url;
      lasuli.hypertopic.currentUrl = "about:blank";
    }
    //Check the sidebar status
    //logger.debug(url);
    if(url && url != "about:blank")
      dispatch("lasuli.ui.doUnBlockUI", null);
    else{
      dispatch("lasuli.ui.doClearDocumentPanel", null);
      dispatch("lasuli.ui.doBlockUI", null);
    }

    //If the url is unchanged, do nothing. (e.g. switch between two tabs on the same url)
    if(url == lasuli.hypertopic.currentUrl)
      return false;

    lasuli.hypertopic.currentUrl = url;
    //If the sidebar is not opened yet, do nothing.
    if(!lasuli.core.isSidebarOpen())
      return false;

    if(!url || url == "about:blank")
      return false;

    //logger.debug("doCloseViewpointPanel and doLoadDocument on url:" + lasuli.hypertopic.currentUrl);

    //If opened an empty page, block the lasuli


    dispatch("lasuli.ui.doCloseViewpointPanel", null);
    dispatch("lasuli.core.doLoadDocument", null);
  },

  //Triggered when the document is loaded
  doStateChange : function(domWindow){
    var logger = Log4Moz.repository.getLogger("lasuli.core.doStateChange");
    var url = domWindow.document.location.href;
    if(!url || url == "about:blank") return false;
    //logger.debug(domWindow.document.location.href);
    url = (url.indexOf('#') > 0) ? url.substr(0, url.indexOf('#')) : url;

    if(!this.domWindows) this.domWindows = {};
    this.domWindows[url] = domWindow;
    var nodes = domWindow.document.querySelectorAll("span." + lasuli._class);
    //logger.debug(nodes.length);
    if(nodes.length > 0) return false;
    if(this.fragments[url]){
      var fragments = this.fragments[url];
      //TODO find out why cannot pass dom windows as a parameter
      //dispatch("lasuli.highlighter.doHighlight", {"fragments": fragments, "domWindow": domWindow});
      dispatch("lasuli.highlighter.doHighlight", {"fragments": fragments});
      //logger.debug("finish highlighter");
    }
  },

  doClearFragmentsCache : function(){
    this.fragments = {};
  },

  doLoadDocument : function(){
    var logger = Log4Moz.repository.getLogger("lasuli.core.doLoadDocument");
    if(!lasuli.core.isSidebarOpen()) return false;
    dispatch("lasuli.ui.doClearDocumentPanel", null);

    dispatch("lasuli.ui.doShowItemName", lasuli.hypertopic.itemName);
    dispatch("lasuli.ui.doShowAttributes", lasuli.hypertopic.attributes);
    dispatch("lasuli.ui.doShowUsers", lasuli.hypertopic.docUsers);
    dispatch("lasuli.ui.doShowTagCloud", lasuli.hypertopic.docTags);
    // Highlight all fragments
    var fragments = lasuli.hypertopic.docCoordinates;
    this.fragments[lasuli.hypertopic.currentUrl] = fragments;
    dispatch("lasuli.highlighter.doHighlight", {"fragments": fragments});
  },

  doListViewpoints: function(){
    var logger = Log4Moz.repository.getLogger("lasuli.core.doListViewpoints");
    //Notify lasuli.ui to show the viewpoints
    //logger.debug("lasuli.hypertopic.viewpoints");
    dispatch("lasuli.ui.doShowViewpoints", lasuli.hypertopic.viewpoints);
  },

  doCreateViewpoint : function(viewpointName){
    var logger = Log4Moz.repository.getLogger("lasuli.core.doCreateViewpoint");
    //logger.debug("Name:" + viewpointName);

    var result = lasuli.hypertopic.createViewpoint(viewpointName);
    //reload the viewpoints
    if(result)
      this.doListViewpoints();
    else
      dispatch("lasuli.ui.doShowMessage", {"title": _("Error"), "content": _('create.viewpoint.error', viewpointName)});
  },

  doDestroyViewpoint : function(viewpointID){
    var logger = Log4Moz.repository.getLogger("lasuli.core.doDestroyViewpoint");
    if(lasuli.hypertopic.destroyViewpoint(viewpointID))
    {
      this.doListViewpoints();
      dispatch("lasuli.ui.doCloseViewpointPanel", viewpointID);
    }
    else
      dispatch("lasuli.ui.doShowMessage", {"title": _("Error"), "content": _('destroy.viewpoint.error', viewpointName)});
  },

  doRenameItem : function(arg){
    var logger = Log4Moz.repository.getLogger("lasuli.core.doRenameItem");
    //logger.debug(arg);
    try{
      lasuli.hypertopic.itemName = arg.newName;
      dispatch('lasuli.ui.doShowItemName', arg.newName);
    }catch(e){
      //TODO Show error message
      logger.fatal('failed to rename item');
      dispatch('lasuli.ui.doShowItemName', arg.name);
    }
  },

  doCreateAttribute : function(attribute){
    var logger = Log4Moz.repository.getLogger("lasuli.core.doCreateAttribute");
    lasuli.hypertopic.createAttribute(attribute);
    dispatch("lasuli.ui.doShowAttributes", lasuli.hypertopic.attributes);
  },

  doDestroyAttribute : function(attribute){
    var logger = Log4Moz.repository.getLogger("lasuli.core.doDestroyAttribute");
    lasuli.hypertopic.destroyAttribute(attribute);
    dispatch("lasuli.ui.doShowAttributes", lasuli.hypertopic.attributes);
  },

  doOpenViewpointByTopicName : function(topicName) {
    var logger = Log4Moz.repository.getLogger("lasuli.core.doOpenViewpointByTopicName");
    //logger.debug("topicName: " + topicName);
    if(!lasuli.hypertopic.docTags || !lasuli.hypertopic.docTags[topicName])
      return false;

    var viewpoints = lasuli.hypertopic.getViewpointsByTopicName(topicName);
    dispatch("lasuli.ui.doShowViewpointPanels", viewpoints);
  },

  doOpenViewpointByUser : function(user){
    var logger = Log4Moz.repository.getLogger("lasuli.core.doOpenViewpointByUser");
    var viewpoints = lasuli.hypertopic.getViewpointsByUser(user);
    logger.trace(viewpoints);
    //TODO filter not related viewpoints
    dispatch("lasuli.ui.doShowViewpointPanels", viewpoints);
  },

  doLoadTopicTree : function(viewpointID){
    var logger = Log4Moz.repository.getLogger("lasuli.core.doLoadTopicTree");
    //logger.debug(viewpointID);
    lasuli.hypertopic.viewpointID = viewpointID;
    var tree = lasuli.hypertopic.topicTree;
    //logger.debug(tree);
    dispatch("lasuli.ui.doShowTopicTree", tree);
  },

  doCreateTopicTreeItem: function(arg){
    var logger = Log4Moz.repository.getLogger("lasuli.core.doCreateTopicTreeItem");
    //logger.debug(arg);
    var topic = lasuli.hypertopic.createAnalysis(arg.viewpointID, arg.topicID, _("no.name"));
    //logger.debug(topic);
    if(topic)
    {
      dispatch("lasuli.ui.doCreateTopicTreeItem", {"viewpointID": arg.viewpointID, "topicID": topic.topicID, "sourceObj":arg.sourceObj});

      //append to analysis
      dispatch("lasuli.ui.doCreateAnalysis", topic);
      //add menu item to context menu
      dispatch("lasuli.contextmenu.doAddMenuItem", topic );
    }
    else
      dispatch("lasuli.ui.doShowMessage", {"title": _("Error"), "content": _('topictree.create.topic.failed')});
  },

  doDestroyTopicTreeItem: function(arg){
    var logger = Log4Moz.repository.getLogger("lasuli.core.doDestroyTopicTreeItem");
    //logger.debug(arg);
    var topicID = arg.topicID;
    var viewpointID = arg.viewpointID;

    if(arg.topicType && (arg.topicType == "analysis" || arg.topicType == "topic"))
    {
      var result = lasuli.hypertopic.destroyAnalysis(viewpointID, topicID);
      if(result){
        dispatch("lasuli.ui.doDestroyTopicTreeItem", arg );
        dispatch("lasuli.ui.doDestroyAnalysis", arg );
        dispatch("lasuli.contextmenu.doRemoveMenuItem", topicID );
        //lasuli.hypertopic.tags = null;
        //lasuli.hypertopic.users = null;
        for(var i=0, fragmentID; fragmentID = result[i]; i++)
            dispatch("lasuli.highlighter.doRemoveFragment", fragmentID );
      }
      else
        dispatch("lasuli.ui.doShowMessage", {"title": _("Error"), "content": _('topictree.topic.delete.failed', [arg.name])});

      return;
    }
    if(arg.topicType && arg.topicType == "keyword")
    {
      var result = lasuli.hypertopic.destroyKeyword(arg, true);
      //logger.debug(result);
      if(result)
      {
        dispatch("lasuli.ui.doDestroyTopicTreeItem", arg );
        dispatch("lasuli.ui.doDestroyKeyword", arg);
        //lasuli.hypertopic.users = null;
        //lasuli.hypertopic.tags = null;
      }
      else
        dispatch("lasuli.ui.doShowMessage", {"title": _("Error"), "content": _('topictree.topic.delete.failed', [arg.name])});

      return;
    }
  },

  doRenameTopicTreeItem : function(arg){
    var logger = Log4Moz.repository.getLogger("lasuli.core.doRenameTopicTreeItem");
    //logger.debug(arg);

    var topicID = arg.topicID;
    var viewpointID = arg.viewpointID;

    if(arg.topicType && arg.topicType == "viewpoint")
    {
      if(lasuli.hypertopic.renameViewpoint(viewpointID, arg.newName))
      {
        arg.name = arg.newName;
        dispatch("lasuli.ui.doRenameViewpoint", viewpointID, arg.newName);
      }
      else
      {
        dispatch("lasuli.ui.doShowMessage", {"title": _("Error"), "content": _('topictree.viewpoint.rename.failed', [arg.name,arg.newName])});
      }
      dispatch("lasuli.ui.doRenameTopicTreeItem", arg);
      return;
    }

    if(arg.topicType && (arg.topicType == "analysis" || arg.topicType == "topic"))
    {
      var result =lasuli.hypertopic.renameAnalysis(arg.viewpointID, arg.topicID, arg.name, arg.newName);
      if(result){
        dispatch("lasuli.contextmenu.doUpdateMenuItem", {"viewpointID": arg.viewpointID, "topicID": arg.topicID, "name": arg.newName});
        arg.name = arg.newName;
        dispatch("lasuli.ui.doRenameAnalysis", arg );
        lasuli.hypertopic.tags = null;
      }
      else
      {
        dispatch("lasuli.ui.doShowMessage", {"title": _("Error"), "content": _('topictree.topic.rename.failed', [arg.name,arg.newName])});
      }
      dispatch("lasuli.ui.doRenameTopicTreeItem", arg);
      return;
    }

    if(arg.topicType && arg.topicType == "keyword")
    {
      var result = lasuli.hypertopic.renameKeyword(arg);

      if(result){
        lasuli.hypertopic.tags = null;
        arg.name = arg.newName;
        dispatch("lasuli.ui.doRestoreKeyword",arg);
      }
      else{
        dispatch("lasuli.ui.doShowMessage", {"title": _("Error"), "content": _('topictree.topic.rename.failed', [arg.name,arg.newName])});
      }
      dispatch("lasuli.ui.doRenameTopicTreeItem", arg);
      return;
    }
  },

  doTagTopicTreeItem : function(arg){
    var logger = Log4Moz.repository.getLogger("lasuli.core.doTagTopicTreeItem");
    //logger.debug(arg);
    var result = lasuli.hypertopic.createKeyword(arg.viewpointID, arg.topicID, arg.name);
    if(!result)
    {
      dispatch("lasuli.ui.doShowMessage", {"title": _("Error"), "content": _('tagItem.failed', [arg.name])});
      return false;
    }
    //lasuli.hypertopic.users = null;
    //lasuli.hypertopic.tags = null;
    dispatch("lasuli.ui.doShowKeywords", lasuli.hypertopic.keywords);
    //update the sourceobj rel value
    dispatch("lasuli.ui.doUpdateTopicTreeMenuItem", {"sourceObj": arg.sourceObj, "rel": "keyword" });
    //Remove this topic from analysis list and from the context menu
    dispatch("lasuli.ui.doDestroyAnalysis", arg );
    dispatch("lasuli.contextmenu.doRemoveMenuItem", arg.topicID );
  },

  doUnTagTopicTreeItem : function(arg){
    var logger = Log4Moz.repository.getLogger("lasuli.core.doUnTagTopicTreeItem");
    //logger.debug(arg);
    var result = lasuli.hypertopic.destroyKeyword({"topicID":  arg.topicID});
    if(!result)
    {
      dispatch("lasuli.ui.doShowMessage", {"title": _("Error"), "content": _('tagItem.delete.failed', [arg.name])});
      return false;
    }
    dispatch("lasuli.ui.doDestroyKeyword", arg);
    dispatch("lasuli.ui.doCreateAnalysis", arg );
    dispatch("lasuli.ui.doUpdateTopicTreeMenuItem", {"sourceObj": arg.sourceObj, "rel": "topic" });
    dispatch("lasuli.contextmenu.doAddMenuItem", arg );
  },

  doLoadKeywords : function(viewpointID){
    var logger = Log4Moz.repository.getLogger("lasuli.core.doLoadKeywords");
    //logger.debug(viewpointID);
    lasuli.hypertopic.viewpointID = viewpointID;
    //logger.debug(lasuli.hypertopic.keywords);
    dispatch("lasuli.ui.doShowKeywords", lasuli.hypertopic.keywords);
  },

  doDestroyKeyword : function(keyword) {
    var logger = Log4Moz.repository.getLogger("lasuli.core.doDestroyKeyword");
    //logger.debug(keyword);
    var topic = lasuli.hypertopic.destroyKeyword(keyword);
    //logger.debug(topic);
    if(!topic)
      dispatch("lasuli.ui.doShowMessage", {"title": _("Error"), "content": _('tagItem.delete.failed', [keyword.name])});
    else
    {
      dispatch("lasuli.ui.doDestroyKeyword", keyword);
      dispatch("lasuli.ui.doCreateAnalysis", topic );
      dispatch("lasuli.contextmenu.doAddMenuItem", topic );
    }
  },

  doRenameKeyword : function(keyword){
    var logger = Log4Moz.repository.getLogger("lasuli.core.doRenameKeyword");
    var result = false;
    if(keyword.newName == keyword.name)
    {
      dispatch("lasuli.ui.doRestoreKeyword",keyword);
      return false;
    }
    var result = lasuli.hypertopic.renameKeyword(keyword);

    if(result){
      keyword.name = keyword.newName;
      lasuli.hypertopic.tags = null;
      dispatch("lasuli.ui.doRestoreKeyword",keyword);
    }
    else{
      dispatch("lasuli.ui.doRestoreKeyword",keyword);
      dispatch("lasuli.ui.doShowMessage", {"title": _("Error"), "content": _('tagItem.rename.failed', [keyword.name,keyword.newName])});
    }
  },

  doCreateAnalysis: function(viewpointID){
    var logger = Log4Moz.repository.getLogger("lasuli.core.doCreateAnalysis");
    //logger.debug(viewpointID);
    var topic = lasuli.hypertopic.createAnalysis(viewpointID);
    if(topic){
      dispatch("lasuli.ui.doCreateAnalysis", topic );
      dispatch("lasuli.contextmenu.doAddMenuItem", topic );
    }
    else
      dispatch("lasuli.ui.doShowMessage", {"title": _("Error"), "content": _('analysis.topic.create.failed')});
  },

  doDestroyAnalysis : function(arg){
    var logger = Log4Moz.repository.getLogger("lasuli.core.doDestroyAnalysis");
    var viewpointID = arg.viewpointID;
    var topicID = arg.topicID;
    var result = lasuli.hypertopic.destroyAnalysis(arg.viewpointID, arg.topicID, arg.name);
    if(result){
      dispatch("lasuli.ui.doDestroyAnalysis", arg );
      dispatch("lasuli.contextmenu.doRemoveMenuItem", topicID );
      for(var i=0, fragmentID; fragmentID = result[i]; i++)
          dispatch("lasuli.highlighter.doRemoveFragment", fragmentID );
    }
    else
      dispatch("lasuli.ui.doShowMessage", {"title": _("Error"), "content": _('analysis.delete.failed', [arg.name])});
  },

  doRenameAnalysis : function(arg){
    var logger = Log4Moz.repository.getLogger("lasuli.core.doRenameAnalysis");
    //logger.debug(arg);
    var result =lasuli.hypertopic.renameAnalysis(arg.viewpointID, arg.topicID, arg.name, arg.newName);
    if(result){
      dispatch("lasuli.contextmenu.doUpdateMenuItem", {"viewpointID": arg.viewpointID, "topicID": arg.topicID, "name": arg.newName});
      arg.name = arg.newName;
    }

    dispatch("lasuli.ui.doRestoreAnalysis", arg );
  },

  doLoadFragments : function(viewpointID){
    var logger = Log4Moz.repository.getLogger("lasuli.core.doLoadFragments");
    lasuli.hypertopic.viewpointID = viewpointID;
    //logger.debug(viewpointID);
    dispatch("lasuli.ui.doShowFragments", {"topics": lasuli.hypertopic.topics, "fragments": lasuli.hypertopic.fragments} );
    //logger.debug(lasuli.hypertopic.fragments);
    //logger.debug(lasuli.hypertopic.coordinates);
    this.fragments[lasuli.hypertopic.currentUrl] = lasuli.hypertopic.coordinates;
    dispatch("lasuli.highlighter.doHighlight", {"fragments": lasuli.hypertopic.coordinates});
    //Enable the mozilla context menu
    //logger.debug("show context menu");
    dispatch('lasuli.contextmenu.doShow', lasuli.hypertopic.topics);
  },

  doCreateFragment : function(fragment){
    var logger = Log4Moz.repository.getLogger("lasuli.core.doCreateFragment");
    logger.debug(fragment);
    try{
      var result = lasuli.hypertopic.createFragment(fragment.topicID, fragment.text, [fragment.startPos, fragment.endPos]);
      var topics = {};
      var fragments = {};
      if(!result) return false;

      if("topic" in result)
      {
        topics[result.topic.topicID] = result.topic;
        dispatch('lasuli.contextmenu.doAddMenuItem', result.topic);
      }

      fragments[result.fragment.getID()] = result.fragment;
      dispatch("lasuli.ui.doShowFragments", {"topics": topics, "fragments": fragments, "scroll": true});
      //Highlight this fragment
      this.fragments[lasuli.hypertopic.currentUrl] = lasuli.hypertopic.coordinates;
      dispatch("lasuli.highlighter.doHighlight", {"fragments": this.fragments[lasuli.hypertopic.currentUrl]});
    }catch(e){
      logger.fatal(e);
    }
  },

  doDestroyFragment : function(fragment){
    var logger = Log4Moz.repository.getLogger("lasuli.core.doDestroyFragment");
    //logger.debug(fragment);
    var result = lasuli.hypertopic.destroyFragment(fragment.fragmentID);
    //logger.debug(result);
    if(result)
    {
      dispatch("lasuli.ui.doRemoveFragment", fragment.fragmentID );
      dispatch("lasuli.highlighter.doRemoveFragment", fragment.fragmentID );
    }
  },

  doMoveFragment : function(arg){
    var logger = Log4Moz.repository.getLogger("lasuli.core.doMoveFragment");
    //logger.debug(arg);

    var result = lasuli.hypertopic.moveFragment(arg.fragmentID, arg.targetTopicID);
    //logger.debug(result);
    if(result){
      dispatch("lasuli.ui.doDropFragmentAccepted", arg );
      //logger.debug(lasuli.hypertopic.topics[arg.targetTopicID]);
      var color = getColor(arg.targetTopicID);
      dispatch("lasuli.highlighter.doReColorFragment", arg.fragmentID, color );
    }
    else{
      dispatch("lasuli.ui.doShowMessage", {"title": _("Error"), "content": _('analysis.fragment.move.failed')});
      dispatch("lasuli.ui.doDropFragmentDenied", arg );
    }
  }
}

var lasuliPrefObserver = {
  register: function() {
    this.logger = Log4Moz.repository.getLogger("LaSuli.Core.lasuliPrefObserver");
    this.logger.level = Log4Moz.Level["Debug"];
    var prefService = Cc["@mozilla.org/preferences-service;1"]
                                .getService(Ci.nsIPrefService);
    this._branch = prefService.getBranch("extensions.lasuli.");
    this._branch.QueryInterface(Components.interfaces.nsIPrefBranch2);
    this._branch.addObserver("", this, false);
    //this.logger.debug('register preference observer');
  },

  unregister: function() {
    if (!this._branch) return;
    this._branch.removeObserver("", this);
    //this.logger.debug('unregister preference observer');
  },

  observe: function(aSubject, aTopic, aData) {
    if(aTopic != "nsPref:changed") return;
    this.logger.debug("extensions.lasuli." + aData + " changed!");
    lasuli.core.doPrefChange();
  }
}

lasuli.sidebar = {
  init: function(){

    this.changeWorker = new Worker("chrome://lasuli/content/js/change_worker.js");
    this.changeWorker.onmessage = function(event) {
      var logger = Log4Moz.repository.getLogger("changeWorker.onmessage");
      if(event.data)
      {
        logger.trace(event.data);
        if(HtServers[event.data])
          HtServers[event.data].purgeCache();
      }
    }
  },
  onSidebarOpened: function(){
    var logger = Log4Moz.repository.getLogger("lasuli.sidebar.onSidebarOpened");
    //logger.debug("opening LaSuli sidebar");
    lasuli.core.register();
    lasuliPrefObserver.register();
    lasuli.core.loadSetting();
    this.changeWorker.postMessage(HtServers);
  },
  onSidebarClosed: function(){
    var logger = Log4Moz.repository.getLogger("lasuli.sidebar.onSidebarClosed");
    //logger.debug("closing LaSuli sidebar");
    lasuliPrefObserver.unregister();
    lasuli.core.unregister();
    this.changeWorker.postMessage('shutdown');
  }
}

window.addEventListener("load", function() {
  lasuli.init();
  lasuli.sidebar.init();
  Observers.add("lasuli.sidebar.onSidebarOpened", lasuli.sidebar.onSidebarOpened, lasuli.sidebar);
  Observers.add("lasuli.sidebar.onSidebarClosed", lasuli.sidebar.onSidebarClosed, lasuli.sidebar);
}, false);

window.addEventListener("unload", function() {
  Observers.remove("lasuli.sidebar.onSidebarOpened", lasuli.sidebar.onSidebarOpened, lasuli);
  Observers.remove("lasuli.sidebar.onSidebarClosed", lasuli.sidebar.onSidebarClosed, lasuli);
}, false);