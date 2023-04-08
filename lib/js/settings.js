// Preferd settings 
if (dbGetItem("settings.disablegreet") === null) {dbSetItem("settings.disablegreet", "false")}
if (dbGetItem("settings.startupfullscreen") === null) {dbSetItem("settings.startupfullscreen", "true")}
if (dbGetItem("settings.startuppage") === null) {dbSetItem("settings.startuppage", "https://soundcloud.com/discover")}

// Main settings functions and object
let settings = {
    disablegreet: dbGetItem("settings.disablegreet"),
    startuppage: dbGetItem("settings.startuppage"),
    startupfullscreen: dbGetItem("settings.startupfullscreen"),
}

function saveSettings() {
    dbSetItem("settings.disablegreet", settings.disablegreet)
    dbSetItem("settings.startupfullscreen", settings.startupfullscreen)
    dbSetItem("settings.startuppage", settings.startuppage)
}

function changeSetting(key, value) {
    settings[key] = value
    saveSettings()
}

function toggleSetting(key) {
    if (settings[key] === "true") {
        settings[key] = "false"
    } else {
        settings[key] = "true"
    }
    saveSettings()
}

// DOM reactions
let settingtoggles = document.querySelectorAll(".optionrow .col2 .toggleswitch")
let settinginputs = document.querySelectorAll(".optionrow .col2 input")

if (settings.disablegreet === "true") {
    settingtoggles[0].classList.add("toggledswitch")
}
if (settings.startupfullscreen === "true") {
    settingtoggles[1].classList.add("toggledswitch")
}

settinginputs[0].value = settings.startuppage

function toggleSwitch(index) {
    let toggle = settingtoggles[index]
    toggle.classList.toggle("toggledswitch")
    if (toggle.id === "disablegreet") {
        toggleSetting("disablegreet")
    } else if (toggle.id === "startupfullscreen") {
        toggleSetting("startupfullscreen")
    }
}

function inputChange(index) {
    let input = document.querySelectorAll(".optionrow .col2 input")[index]
    if (input.id === "startuppage") {
        changeSetting("startuppage", input.value)
    }
}