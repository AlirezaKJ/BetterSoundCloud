let settings = {
  customcss: dbResolve("settings.customcss", undefined),
  customjs: dbResolve("settings.customjs", undefined),
  custombg: dbResolve("settings.custombg", true),
  discordrpc:dbResolve("settings.discordrpc", true),
  bindctrlr: dbResolve("settings.bindctrlr", "reloadview"),
  bindf5: dbResolve("settings.bindf5", undefined),
  startupfullscreen: dbResolve("settings.startupfullscreen", false),
  startuplastpage: dbResolve("settings.startuplastpage", false),
  lasturlvisited: dbResolve("settings.lasturlvisited", "https://soundcloud.com/discover"),
  startupurl: dbResolve("settings.startupurl", false),
  scrollerbtn: dbResolve("settings.scrollerbtn", false),
  zoomfactor: dbResolve("settings.zoomfactor", 100),
  theme: dbResolve("settings.theme", "darkcloud"),
}

function updateLS() {
  dbSetItem("settings.customcss", settings.customcss)
  dbSetItem("settings.customjs", settings.customjs)
  dbSetItem("settings.custombg", settings.custombg)
  dbSetItem("settings.discordrpc", settings.discordrpc)
  dbSetItem("settings.bindctrlr", settings.bindctrlr)
  dbSetItem("settings.bindf5", settings.bindf5)
  dbSetItem("settings.startupfullscreen", settings.startupfullscreen)
  dbSetItem("settings.startuplastpage", settings.startuplastpage)
  dbSetItem("settings.lasturlvisited", settings.lasturlvisited)
  dbSetItem("settings.startupurl", settings.startupurl)
  dbSetItem("settings.scrollerbtn", settings.scrollerbtn)
  dbSetItem("settings.zoomfactor", settings.zoomfactor)
  dbSetItem("settings.theme", settings.theme)
}

function changeSettings(name, value) {
  settings[name] = value
  updateLS()
}