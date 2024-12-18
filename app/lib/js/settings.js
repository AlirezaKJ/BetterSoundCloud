let settings = {
  custombg: dbResolve("settings.custombg", true),
  discordrpc:dbResolve("settings.discordrpc", true),
  bindctrlr: dbResolve("settings.bindctrlr", "reloadview"),
  bindf5: dbResolve("settings.bindf5", undefined),
  startupfullscreen: dbResolve("settings.startupfullscreen", false),
  startuplastpage: dbResolve("settings.startuplastpage", false),
  startupurl: dbResolve("settings.startupurl", false),
  scrollerbtn: dbResolve("settings.scrollerbtn", false),
}

function updateLS() {
  dbSetItem("settings.custombg", settings.custombg)
  dbSetItem("settings.discordrpc", settings.discordrpc)
  dbSetItem("settings.bindctrlr", settings.bindctrlr)
  dbSetItem("settings.bindf5", settings.bindf5)
  dbSetItem("settings.startupfullscreen", settings.startupfullscreen)
  dbSetItem("settings.startuplastpage", settings.startuplastpage)
  dbSetItem("settings.startupurl", settings.startupurl)
  dbSetItem("settings.scrollerbtn", settings.scrollerbtn)
}

function changeSettings(name, value) {
  settings[name] = value
  updateLS()
}