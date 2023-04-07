// Preferd settings 
if (dbGetItem("settings.disablegreet") === null) {dbSetItem("settings.disablegreet", "false")}
if (dbGetItem("settings.startuppage") === null) {dbSetItem("settings.startuppage", "https://soundcloud.com/discover")}

// Main settings functions and object
let settings = {
    disablegreet: dbGetItem("settings.disablegreet"),
    startuppage: dbGetItem("settings.startuppage"),
}

function saveSettings() {
    dbSetItem("settings.disablegreet", settings.disablegreet)
    dbSetItem("settings.startuppage", settings.startuppage)
}

function changeSetting(key, value) {
    settings[key] = value
    saveSettings()
}