let gamepad1 = null;
let gamepad2 = null;

export function listenToGamepads() {
    if(gamepad1==null){
        if (navigator.getGamepads()[0]) {
            console.log("Gamepad 1 connected")
            gamepad1 = navigator.getGamepads()[0];
        }
    }
    if(gamepad1!=null){
        gamepad1 = navigator.getGamepads()[0];
        if(gamepad1.buttons[0].pressed==true){
            window.dispatchEvent(new KeyboardEvent('keydown',  {'key':'Enter'}));
        }

        /*
        // Code for GAMEPAD
        if(gamepad1.buttons[12].pressed==true){
            window.dispatchEvent(new KeyboardEvent('keydown',  {'key':'w'}));
        }
        if(gamepad1.buttons[13].pressed==true){
            window.dispatchEvent(new KeyboardEvent('keydown',  {'key':'s'}));
        }
        if(gamepad1.buttons[14].pressed==true){
            window.dispatchEvent(new KeyboardEvent('keydown',  {'key':'a'}));
        }
        if(gamepad1.buttons[15].pressed==true){
            window.dispatchEvent(new KeyboardEvent('keydown',  {'key':'d'}));
        }
        */

        // CODE FOR ARCADE CONTROLLER
        //console.log("PLAYER 1")
        //console.log("0 == "+ gamepad1.axes[0]) // Left = -1 || Right = 1
        //console.log("1 == "+ gamepad1.axes[1]) // Up = -1 || Down = 1
        if(gamepad1.axes[1]<-0.5){
            window.dispatchEvent(new KeyboardEvent('keydown',  {'key':'w'}));
        }
        if(gamepad1.axes[1]>0.5){
            window.dispatchEvent(new KeyboardEvent('keydown',  {'key':'s'}));
        }
        if(gamepad1.axes[0]<-0.5){
            window.dispatchEvent(new KeyboardEvent('keydown',  {'key':'a'}));
        }
        if(gamepad1.axes[0]>0.5){
            window.dispatchEvent(new KeyboardEvent('keydown',  {'key':'d'}));
        }
    }
    if(gamepad2==null){
        if(navigator.getGamepads()[1]) {
            console.log("Gamepad 2 connected")
            gamepad2 = navigator.getGamepads()[1];
        }
    }
    else if(gamepad2!=null){
        gamepad2 = navigator.getGamepads()[1];
        if(gamepad2.buttons[0].pressed==true){
            window.dispatchEvent(new KeyboardEvent('keydown',  {'key':'Enter'}));
        }

        /*
        // Code for GAMEPAD
        if(gamepad2.buttons[12].pressed==true){
            window.dispatchEvent(new KeyboardEvent('keydown',  {'key':'ArrowUp'}));
        }
        if(gamepad2.buttons[13].pressed==true){
            window.dispatchEvent(new KeyboardEvent('keydown',  {'key':'ArrowDown'}));
        }
        if(gamepad2.buttons[14].pressed==true){
            window.dispatchEvent(new KeyboardEvent('keydown',  {'key':'ArrowLeft'}));
        }
        if(gamepad2.buttons[15].pressed==true){
            window.dispatchEvent(new KeyboardEvent('keydown',  {'key':'ArrowRight'}));
        }
        */

        // CODE FOR ARCADE CONTROLLER
        //console.log("PLAYER 2")
        //console.log("0 == "+ gamepad2.axes[0]) // Left = -1 || Right = 1
        //console.log("1 == "+ gamepad2.axes[1]) // Up = -1 || Down = 1
        if(gamepad2.axes[1]<-0.5){
            window.dispatchEvent(new KeyboardEvent('keydown',  {'key':'ArrowUp'}));
        }
        if(gamepad2.axes[1]>0.5){
            window.dispatchEvent(new KeyboardEvent('keydown',  {'key':'ArrowDown'}));
        }
        if(gamepad2.axes[0]<-0.5){
            window.dispatchEvent(new KeyboardEvent('keydown',  {'key':'ArrowLeft'}));
        }
        if(gamepad2.axes[0]>0.5){
            window.dispatchEvent(new KeyboardEvent('keydown',  {'key':'ArrowRight'}));
        }
    }
}