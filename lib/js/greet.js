let greetelements = document.querySelectorAll(".greet .greet-item")

greetelements[1].innerHTML = `V${clientVersion} Beta`

function greet() {
    setTimeout(() => {
        greetelements[0].classList.add("fade")
    },1500)
    setTimeout(() => {
        greetelements[1].classList.remove("fade")
    },2000)
    setTimeout(() => {
        greetelements[1].classList.add("fade")
    },4500)
    setTimeout(() => {
        greetelements[2].classList.remove("fade")
    },5000)
    setTimeout(() => {
        greetelements[2].classList.add("fade")
        greetelements[0].parentElement.style.opacity = "0"
    },6500)
    setTimeout(() => {
        greetelements[0].parentElement.style.display = "none"
    },7500)
} 


// webview.executeJavaScript(`
// setInterval(function(){

//     var source = document.getElementsByTagName('html')[0].innerHTML;
//     var found = source.search("Advertisement");

//     if(found != -1){
//         window.location.reload(true);
//     }
    
// }, 1000);

// function alertFunction() {

//     setTimeout(function(){
//         var btn = document.querySelector(".playControls__play");
//         btn.click();
//     }, 3000);

// }

// window.onload = alertFunction;

// console.log("runshod")`)