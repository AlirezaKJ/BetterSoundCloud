// Menu Bar Frame Injection To Main Frame In Header
// Remove All Useless Buttons First
let rightnavbar = document.querySelector(".header__right .header__navMenu");
// document.querySelectorAll(".header__right .header__navMenu * ").forEach(element => {element.remove()});
document.querySelectorAll(".header__right .header__link").forEach((element) => {
  element.remove();
});

let closebtn = document.createElement("li");
closebtn.classList.add("header__appclosebtn");
closebtn.classList.add("header__app__custombtns");
closebtn.setAttribute("onclick", "console.log('BSCReceive|UISettingCloseApp')");
closebtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px"><path d="m256-200-56-56 224-224-224-224 56-56 224 224 224-224 56 56-224 224 224 224-56 56-224-224-224 224Z"/></svg>`;

let maximizebtn = document.createElement("li");
maximizebtn.classList.add("header__appmaximizebtn");
maximizebtn.classList.add("header__app__custombtns");
maximizebtn.setAttribute("onclick", "maximize()");
maximizebtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px"><path d="M120-120v-200h80v120h120v80H120Zm520 0v-80h120v-120h80v200H640ZM120-640v-200h200v80H200v120h-80Zm640 0v-120H640v-80h200v200h-80Z"/></svg>`;

let minimizebtn = document.createElement("li");
minimizebtn.classList.add("header__appminimizebtn");
minimizebtn.classList.add("header__app__custombtns");
minimizebtn.setAttribute(
  "onclick",
  "console.log('BSCReceive|UISettingMinimizeApp')",
);
minimizebtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px"><path d="M240-120v-80h480v80H240Z"/></svg>`;

function toggleMenuIcons() {
  state = maximizebtn.classList.contains("header__appmaximizebtn__alt");
  if (state) {
    maximizebtn.classList.remove("header__appmaximizebtn__alt");
    maximizebtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px"><path d="M240-120v-120H120v-80h200v200h-80Zm400 0v-200h200v80H720v120h-80ZM120-640v-80h120v-120h80v200H120Zm520 0v-200h80v120h120v80H640Z"/></svg>`;
    minimizebtn.style.display = "flex";
    closebtn.style.display = "flex";
  } else {
    maximizebtn.classList.add("header__appmaximizebtn__alt");
    maximizebtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px"><path d="M120-120v-200h80v120h120v80H120Zm520 0v-80h120v-120h80v200H640ZM120-640v-200h200v80H200v120h-80Zm640 0v-120H640v-80h200v200h-80Z"/></svg>`;
    minimizebtn.style.display = "none";
    closebtn.style.display = "none";
  }
}

// Since the default mode is the icons hide
toggleMenuIcons();

function maximize() {
  toggleMenuIcons();
  console.log("BSCReceive|UISettingMaximizeApp");
}

rightnavbar.appendChild(minimizebtn);
rightnavbar.appendChild(maximizebtn);
rightnavbar.appendChild(closebtn);

// Header Previos And Next Btn
let leftheaderbar = document.querySelector(".header__left .header__navMenu");

let nextbtn = document.createElement("li");
nextbtn.classList.add("header__appnextbtn");
nextbtn.classList.add("header__app__custombtns");
nextbtn.setAttribute("onclick", "console.log('BSCReceive|UISettingNextFrame')");
nextbtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px"><path d="m321-80-71-71 329-329-329-329 71-71 400 400L321-80Z"/></svg>`;

let previousbtn = document.createElement("li");
previousbtn.classList.add("header__apppreviousbtn");
previousbtn.classList.add("header__app__custombtns");
previousbtn.setAttribute(
  "onclick",
  "console.log('BSCReceive|UISettingPreviousFrame')",
);
previousbtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px"><path d="M640-80 240-480l400-400 71 71-329 329 329 329-71 71Z"/></svg>`;

leftheaderbar.insertBefore(nextbtn, leftheaderbar.firstChild);
leftheaderbar.insertBefore(previousbtn, leftheaderbar.firstChild);

// Header Replace Text With Icon
let leftheadernavmenuitems = document.querySelectorAll(
  ".header__navMenu li .header__navMenuItem",
);

let homeiconsvg = `<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 0 24 24" width="24px"><path d="M0 0h24v24H0V0z" fill="none"/><path d="M10 19v-5h4v5c0 .55.45 1 1 1h3c.55 0 1-.45 1-1v-7h1.7c.46 0 .68-.57.33-.87L12.67 3.6c-.38-.34-.96-.34-1.34 0l-8.36 7.53c-.34.3-.13.87.33.87H5v7c0 .55.45 1 1 1h3c.55 0 1-.45 1-1z"/></svg>`;
let feediconsvg = `<svg xmlns="http://www.w3.org/2000/svg" enable-background="new 0 0 24 24" height="24px" viewBox="0 0 24 24" width="24px"><rect fill="none" height="24" width="24"/><g><path d="M12,12.75c1.63,0,3.07,0.39,4.24,0.9c1.08,0.48,1.76,1.56,1.76,2.73L18,17c0,0.55-0.45,1-1,1H7c-0.55,0-1-0.45-1-1l0-0.61 c0-1.18,0.68-2.26,1.76-2.73C8.93,13.14,10.37,12.75,12,12.75z M4,13c1.1,0,2-0.9,2-2c0-1.1-0.9-2-2-2s-2,0.9-2,2 C2,12.1,2.9,13,4,13z M5.13,14.1C4.76,14.04,4.39,14,4,14c-0.99,0-1.93,0.21-2.78,0.58C0.48,14.9,0,15.62,0,16.43L0,17 c0,0.55,0.45,1,1,1l3.5,0v-1.61C4.5,15.56,4.73,14.78,5.13,14.1z M20,13c1.1,0,2-0.9,2-2c0-1.1-0.9-2-2-2s-2,0.9-2,2 C18,12.1,18.9,13,20,13z M24,16.43c0-0.81-0.48-1.53-1.22-1.85C21.93,14.21,20.99,14,20,14c-0.39,0-0.76,0.04-1.13,0.1 c0.4,0.68,0.63,1.46,0.63,2.29V18l3.5,0c0.55,0,1-0.45,1-1L24,16.43z M12,6c1.66,0,3,1.34,3,3c0,1.66-1.34,3-3,3s-3-1.34-3-3 C9,7.34,10.34,6,12,6z"/></g></svg>`;
let libraryiconsvg = `<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 0 24 24" width="24px"><path d="M20 2H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-3 5h-2v5.37c0 1.27-.9 2.44-2.16 2.6-1.69.23-3.11-1.25-2.8-2.95.2-1.1 1.18-1.95 2.3-2.02.63-.04 1.2.16 1.66.51V6c0-.55.45-1 1-1h2c.55 0 1 .45 1 1s-.45 1-1 1zM3 6c-.55 0-1 .45-1 1v13c0 1.1.9 2 2 2h13c.55 0 1-.45 1-1s-.45-1-1-1H5c-.55 0-1-.45-1-1V7c0-.55-.45-1-1-1z"/></svg>`;

leftheadernavmenuitems[0].innerHTML = homeiconsvg;
leftheadernavmenuitems[1].innerHTML = feediconsvg;
leftheadernavmenuitems[2].innerHTML = libraryiconsvg;

// leftheadernavmenuitems.forEach(element => {
//     element.style.display = "flex"
//     element.style.justifyContent = "center"
//     element.style.alignItems = "center"
//     element.style.width = "46px"
//     element.style.height = "46px"
//     element.style.borderRight = "none"
// });

let leftheadernavmenuitemsvg = document.querySelectorAll(
  ".header__navMenu li .header__navMenuItem svg",
);
leftheadernavmenuitemsvg.forEach((element) => {
  // This is required to fix icons for other themes (nocturnal and hover)
  element.setAttribute(
    "style",
    "overflow: visible !important; opacity: 1 !important; filter: invert(0) !important;",
  );
});

// Audio Bar Injection
let playControls__elements = document.querySelector(".playControls__elements");
let pluginbtn = document.createElement("a");
let themebtn = document.createElement("div");
let lyricbtn = document.createElement("div");
let openshowcasebtn = document.createElement("div");
pluginbtn.classList.add("playControls__pluginbtn");
pluginbtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px"><path d="M352-120H120v-232q48 0 84-30.5t36-77.5q0-47-36-77.5T120-568v-232h240q0-42 29-71t71-29q42 0 71 29t29 71h240v240q42 0 71 29t29 71q0 42-29 71t-71 29v240H568q0-50-31.5-85T460-240q-45 0-76.5 35T352-120Z"/></svg>`;
themebtn.classList.add("playControls__themebtn");
themebtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px"><path d="M480-80q-82 0-155-31.5t-127.5-86Q143-252 111.5-325T80-480q0-83 32.5-156t88-127Q256-817 330-848.5T488-880q80 0 151 27.5t124.5 76q53.5 48.5 85 115T880-518q0 115-70 176.5T640-280h-74q-9 0-12.5 5t-3.5 11q0 12 15 34.5t15 51.5q0 50-27.5 74T480-80ZM260-440q26 0 43-17t17-43q0-26-17-43t-43-17q-26 0-43 17t-17 43q0 26 17 43t43 17Zm120-160q26 0 43-17t17-43q0-26-17-43t-43-17q-26 0-43 17t-17 43q0 26 17 43t43 17Zm200 0q26 0 43-17t17-43q0-26-17-43t-43-17q-26 0-43 17t-17 43q0 26 17 43t43 17Zm120 160q26 0 43-17t17-43q0-26-17-43t-43-17q-26 0-43 17t-17 43q0 26 17 43t43 17Z"/></svg>`;
lyricbtn.classList.add("playControls__lyricbtn");
lyricbtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px"><path d="M480-400q-50 0-85-35t-35-85v-240q0-50 35-85t85-35q50 0 85 35t35 85v240q0 50-35 85t-85 35Zm-40 280v-123q-104-14-172-93t-68-184h80q0 83 58.5 141.5T480-320q83 0 141.5-58.5T680-520h80q0 105-68 184t-172 93v123h-80Z"/></svg>`;
openshowcasebtn.classList.add("playControls__showcasebtn");
openshowcasebtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px"><path d="m380-300 280-180-280-180v360ZM80-160v-640h800v640H80Z"/></svg>`;
pluginbtn.setAttribute(
  "onclick",
  "console.log('BSCReceive|UISettingShowRequest|1')",
);
themebtn.setAttribute(
  "onclick",
  "console.log('BSCReceive|UISettingShowRequest|2')",
);
lyricbtn.setAttribute(
  "onclick",
  "console.log('BSCReceive|UIActivateLyricShowCase')",
);
openshowcasebtn.setAttribute(
  "onclick",
  "console.log('BSCReceive|UIActivateShowCase')",
);

playControls__elements.appendChild(pluginbtn);
playControls__elements.appendChild(themebtn);
playControls__elements.appendChild(lyricbtn);
playControls__elements.appendChild(openshowcasebtn);

const waitForElement = (selector, timeout = 60 * 60) =>
  new Promise((resolve, reject) => {
    if (document.querySelector(selector)) {
      return resolve(document.querySelector(selector));
    }

    const observer = new MutationObserver((mutationsList, observer) => {
      const element = document.querySelector(selector);
      if (element) {
        observer.disconnect();
        resolve(element);
      }
    });

    if (timeout > 0) {
      setTimeout(() => {
        observer.disconnect();
        reject();
      }, timeout);
    }

    observer.observe(document.body, { childList: true, subtree: true });
  });

waitForElement(".header__goUpsell_side_by_side_experience").then((e) =>
  e.remove(),
);
waitForElement(".creatorSubscriptionsButton").then((e) => e.remove());
waitForElement(".header__upsellWrapper").then((e) => e.remove());
waitForElement(".header__userNavActivitiesButton").then((e) => e.remove());
waitForElement(".header__userNavMessagesButton").then((e) => e.remove());
waitForElement(".header__soundInput").then((e) => e.remove());

// Media Player Btns Functions
let playpausebtn = document.querySelector(
  ".playControls__elements .playControls__play",
);
let previoussongbtn = document.querySelector(
  ".playControls__elements .playControls__prev",
);
let nextsongbtn = document.querySelector(
  ".playControls__elements .playControls__next",
);

issciloaded = true;
