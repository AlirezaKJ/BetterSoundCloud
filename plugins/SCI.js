// Menu Bar Frame Injection To Main Frame In Header
// Remove All Useless Buttons First
let rightnavbar = document.querySelector(".header__right .header__navMenu")
document.querySelectorAll(".header__right .header__navMenu * ").forEach(element => {element.remove()});
document.querySelector(".header__userNavActivitiesButton").remove()
document.querySelector(".header__userNavMessagesButton").remove()
document.querySelector(".header__soundInput").remove()

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

// Audio Bar Injection
let playControls__elements = document.querySelector(".playControls__elements")
let pluginbtn = document.createElement("a")
let themebtn = document.createElement("div")
pluginbtn.classList.add("playControls__pluginbtn")
themebtn.classList.add("playControls__themebtn")
pluginbtn.setAttribute("onclick","console.log('BSCReceive|UISettingShowRequest|1')")
themebtn.setAttribute("onclick","console.log('BSCReceive|UISettingShowRequest|2')")

playControls__elements.appendChild(pluginbtn)
playControls__elements.appendChild(themebtn)


// After 1 second do all the operations (for div load up)
setTimeout(() => {
    let navbaradbuttons = [document.querySelector(".header__goUpsell_side_by_side_experience"),document.querySelector(".creatorSubscriptionsButton")]
    
    navbaradbuttons.forEach(element => {element.remove()});
}, 1000);