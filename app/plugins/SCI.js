// Menu Bar Frame Injection To Main Frame In Header
// Remove All Useless Buttons First
let rightnavbar = document.querySelector(".header__right .header__navMenu")
document.querySelectorAll(".header__right .header__navMenu * ").forEach(element => {element.remove()});
document.querySelectorAll(".header__right .header__link").forEach(element => {element.remove()});


let closebtn = document.createElement("li")
closebtn.classList.add("header__appclosebtn")
closebtn.classList.add("header__app__custombtns")
closebtn.setAttribute("onclick","console.log('BSCReceive|UISettingCloseApp')")

let maximizebtn = document.createElement("li")
maximizebtn.classList.add("header__appmaximizebtn")
maximizebtn.classList.add("header__app__custombtns")
maximizebtn.setAttribute("onclick","maximize()")

let minimizebtn = document.createElement("li")
minimizebtn.classList.add("header__appminimizebtn")
minimizebtn.classList.add("header__app__custombtns")
minimizebtn.setAttribute("onclick","console.log('BSCReceive|UISettingMinimizeApp')")

function toggleMenuIcons() {
    state = maximizebtn.classList.contains("header__appmaximizebtn__alt")
    if (state) {
        maximizebtn.classList.remove("header__appmaximizebtn__alt")
        minimizebtn.style.display = "block"
        closebtn.style.display = "block"
    } else {
        maximizebtn.classList.add("header__appmaximizebtn__alt")
        minimizebtn.style.display = "none"
        closebtn.style.display = "none"
    }
}

// Since the default mode is the icons hide
toggleMenuIcons()

function maximize() {
    toggleMenuIcons()
    console.log('BSCReceive|UISettingMaximizeApp')
}



rightnavbar.appendChild(minimizebtn)
rightnavbar.appendChild(maximizebtn)
rightnavbar.appendChild(closebtn)


// Header Previos And Next Btn 
let leftheaderbar = document.querySelector(".header__left .header__navMenu")

let nextbtn = document.createElement("li")
nextbtn.classList.add("header__appnextbtn")
nextbtn.classList.add("header__app__custombtns")
nextbtn.setAttribute("onclick","console.log('BSCReceive|UISettingNextFrame')")

let previousbtn = document.createElement("li")
previousbtn.classList.add("header__apppreviousbtn")
previousbtn.classList.add("header__app__custombtns")
previousbtn.setAttribute("onclick","console.log('BSCReceive|UISettingPreviousFrame')")

leftheaderbar.insertBefore(nextbtn, leftheaderbar.firstChild);
leftheaderbar.insertBefore(previousbtn, leftheaderbar.firstChild);

// Header Replace Text With Icon
let leftheadernavmenuitems = document.querySelectorAll(".header__navMenu li .header__navMenuItem")

let homeiconsvg = `<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 0 24 24" width="24px" fill="#FFFFFF"><path d="M0 0h24v24H0V0z" fill="none"/><path d="M10 19v-5h4v5c0 .55.45 1 1 1h3c.55 0 1-.45 1-1v-7h1.7c.46 0 .68-.57.33-.87L12.67 3.6c-.38-.34-.96-.34-1.34 0l-8.36 7.53c-.34.3-.13.87.33.87H5v7c0 .55.45 1 1 1h3c.55 0 1-.45 1-1z"/></svg>`
let feediconsvg = `<svg xmlns="http://www.w3.org/2000/svg" enable-background="new 0 0 24 24" height="24px" viewBox="0 0 24 24" width="24px" fill="#FFFFFF"><rect fill="none" height="24" width="24"/><g><path d="M12,12.75c1.63,0,3.07,0.39,4.24,0.9c1.08,0.48,1.76,1.56,1.76,2.73L18,17c0,0.55-0.45,1-1,1H7c-0.55,0-1-0.45-1-1l0-0.61 c0-1.18,0.68-2.26,1.76-2.73C8.93,13.14,10.37,12.75,12,12.75z M4,13c1.1,0,2-0.9,2-2c0-1.1-0.9-2-2-2s-2,0.9-2,2 C2,12.1,2.9,13,4,13z M5.13,14.1C4.76,14.04,4.39,14,4,14c-0.99,0-1.93,0.21-2.78,0.58C0.48,14.9,0,15.62,0,16.43L0,17 c0,0.55,0.45,1,1,1l3.5,0v-1.61C4.5,15.56,4.73,14.78,5.13,14.1z M20,13c1.1,0,2-0.9,2-2c0-1.1-0.9-2-2-2s-2,0.9-2,2 C18,12.1,18.9,13,20,13z M24,16.43c0-0.81-0.48-1.53-1.22-1.85C21.93,14.21,20.99,14,20,14c-0.39,0-0.76,0.04-1.13,0.1 c0.4,0.68,0.63,1.46,0.63,2.29V18l3.5,0c0.55,0,1-0.45,1-1L24,16.43z M12,6c1.66,0,3,1.34,3,3c0,1.66-1.34,3-3,3s-3-1.34-3-3 C9,7.34,10.34,6,12,6z"/></g></svg>`
let libraryiconsvg = `<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 0 24 24" width="24px" fill="#FFFFFF"><path d="M20 2H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-3 5h-2v5.37c0 1.27-.9 2.44-2.16 2.6-1.69.23-3.11-1.25-2.8-2.95.2-1.1 1.18-1.95 2.3-2.02.63-.04 1.2.16 1.66.51V6c0-.55.45-1 1-1h2c.55 0 1 .45 1 1s-.45 1-1 1zM3 6c-.55 0-1 .45-1 1v13c0 1.1.9 2 2 2h13c.55 0 1-.45 1-1s-.45-1-1-1H5c-.55 0-1-.45-1-1V7c0-.55-.45-1-1-1z"/></svg>`

leftheadernavmenuitems[0].innerHTML = homeiconsvg
leftheadernavmenuitems[1].innerHTML = feediconsvg
leftheadernavmenuitems[2].innerHTML = libraryiconsvg

leftheadernavmenuitems.forEach(element => {
    element.style.display = "flex"
    element.style.justifyContent = "center"
    element.style.alignItems = "center"
    element.style.width = "46px"
    element.style.height = "46px"
    element.style.borderRight = "none"
});


let leftheadernavmenuitemsvg = document.querySelectorAll(".header__navMenu li .header__navMenuItem svg")
leftheadernavmenuitemsvg.forEach(element => { // This is required to fix icons for other themes (nocturnal and hover)
    element.setAttribute("style","fill: #ffffff !important;overflow: visible !important; opacity: 1 !important; filter: invert(0) !important;")
});

// Audio Bar Injection
let playControls__elements = document.querySelector(".playControls__elements")
let pluginbtn = document.createElement("a")
let themebtn = document.createElement("div")
let lyricbtn = document.createElement("div")
let openshowcasebtn = document.createElement("div")
pluginbtn.classList.add("playControls__pluginbtn")
themebtn.classList.add("playControls__themebtn")
lyricbtn.classList.add("playControls__lyricbtn")
openshowcasebtn.classList.add("playControls__showcasebtn")
pluginbtn.setAttribute("onclick","console.log('BSCReceive|UISettingShowRequest|1')")
themebtn.setAttribute("onclick","console.log('BSCReceive|UISettingShowRequest|2')")
lyricbtn.setAttribute("onclick","console.log('BSCReceive|UIActivateLyricShowCase')")
openshowcasebtn.setAttribute("onclick","console.log('BSCReceive|UIActivateShowCase')")

playControls__elements.appendChild(pluginbtn)
playControls__elements.appendChild(themebtn)
playControls__elements.appendChild(lyricbtn)
playControls__elements.appendChild(openshowcasebtn)


// After 1 second do all the operations (for div load up)
// TODO: dont work anymore for some reason
// setTimeout(() => {
//     let navbaradbuttons = [document.querySelector(".header__goUpsell_side_by_side_experience"),document.querySelector(".creatorSubscriptionsButton")]
//     navbaradbuttons.forEach(element => {element.remove()});
//     document.querySelector(".header__upsellWrapper").remove()
//     document.querySelector(".header__userNavActivitiesButton").remove()
//     document.querySelector(".header__userNavMessagesButton").remove()
//     document.querySelector(".header__soundInput").remove()
// }, 10000);

// Media Player Btns Functions
let playpausebtn = document.querySelector(".playControls__elements .playControls__play")
let previoussongbtn = document.querySelector(".playControls__elements .playControls__prev")
let nextsongbtn = document.querySelector(".playControls__elements .playControls__next")
