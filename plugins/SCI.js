let playControls__elements = document.querySelector(".playControls__elements")
let pluginbtn = document.createElement("a")
let themebtn = document.createElement("div")
pluginbtn.classList.add("playControls__pluginbtn")
themebtn.classList.add("playControls__themebtn")
pluginbtn.setAttribute("onclick","console.log('BSCReceive|UISettingShowRequest|1')")
themebtn.setAttribute("onclick","console.log('BSCReceive|UISettingShowRequest|2')")

playControls__elements.appendChild(pluginbtn)
playControls__elements.appendChild(themebtn)


// After 10 second do all the operations (for div load up)
setTimeout(() => {
    let navbaradbuttons = [document.querySelector(".header__goUpsell_side_by_side_experience"),document.querySelector(".creatorSubscriptionsButton")]
    
    navbaradbuttons.forEach(element => {element.remove()});
}, 10000);
