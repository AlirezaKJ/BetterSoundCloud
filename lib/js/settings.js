// Preferd settings 
if (dbGetItem("settings.disablegreet") === null) {dbSetItem("settings.disablegreet", "false")}
if (dbGetItem("settings.startupfullscreen") === null) {dbSetItem("settings.startupfullscreen", "true")}
if (dbGetItem("settings.custombg") === null) {dbSetItem("settings.custombg", "true")}
if (dbGetItem("settings.bindcntrlr") === null) {dbSetItem("settings.bindcntrlr", "viewreload")} // all options: viewreload, appreload, disabled
if (dbGetItem("settings.bindf5") === null) {dbSetItem("settings.bindf5", "appreload")} // all options: viewreload, appreload, disabled
if (dbGetItem("settings.startuppage") === null) {dbSetItem("settings.startuppage", "https://soundcloud.com/discover")}

// Main settings functions and object
let settings = {
    disablegreet: dbGetItem("settings.disablegreet"),
    custombg: dbGetItem("settings.custombg"),
    bindcntrlr: dbGetItem("settings.bindcntrlr"),
    bindf5: dbGetItem("settings.bindf5"),
    startupfullscreen: dbGetItem("settings.startupfullscreen"),
    startuppage: dbGetItem("settings.startuppage"),
}

function saveSettings() {
    dbSetItem("settings.disablegreet", settings.disablegreet)
    dbSetItem("settings.startupfullscreen", settings.startupfullscreen)
    dbSetItem("settings.custombg", settings.custombg)
    dbSetItem("settings.bindcntrlr", settings.bindcntrlr)
    dbSetItem("settings.bindf5", settings.bindcntrlf5)
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
if (settings.custombg === "true") {
    settingtoggles[2].classList.add("toggledswitch")
}

settinginputs[0].value = settings.startuppage

function toggleSwitch(index) {
    let toggle = settingtoggles[index]
    toggle.classList.toggle("toggledswitch")
    if (toggle.id === "disablegreet") {
        toggleSetting("disablegreet")
    } else if (toggle.id === "startupfullscreen") {
        toggleSetting("startupfullscreen")
    } else if (toggle.id === "custombg") {
        toggleSetting("custombg")
        webview.reload()
    }
}

function inputChange(index) {
    let input = document.querySelectorAll(".optionrow .col2 input")[index]
    if (input.id === "startuppage") {
        changeSetting("startuppage", input.value)
    }
}

// Select Option Related Setting
let cntrlrbindselect = document.querySelector(".optionrow #cntrlrbindselect")
let f5bindselect = document.querySelector(".optionrow #f5bindselect")

function selectOptionChange() {
    changeSetting("bindcntrlr", cntrlrbindselect.value)
    changeSetting("bindf5", f5bindselect.value)
}

cntrlrbindselect.value = settings.bindcntrlr
f5bindselect.value = settings.bindf5