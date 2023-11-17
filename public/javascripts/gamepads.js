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
        if(gamepad1.buttons[0].pressed==true || gamepad1.buttons[1].pressed==true || gamepad1.buttons[2].pressed==true || gamepad1.buttons[3].pressed==true){
            window.dispatchEvent(new KeyboardEvent('keydown',  {'key':' '}));
        }


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

        if(gamepad1.buttons[12].pressed==false && gamepad1.buttons[13].pressed==false && gamepad1.buttons[14].pressed==false && gamepad1.buttons[15].pressed==false){
          window.dispatchEvent(new KeyboardEvent('keyup',  {'key':'w'}));
        }

        // CODE FOR ARCADE CONTROLLER
        //console.log("PLAYER 1")
        //console.log("0 == "+ gamepad1.axes[0]) // Left = -1 || Right = 1
        //console.log("1 == "+ gamepad1.axes[1]) // Up = -1 || Down = 1

        // Joystick
        if(gamepad1.axes[1]<-0.60){
            window.dispatchEvent(new KeyboardEvent('keydown',  {'key':'w'}));
        }
        if(gamepad1.axes[1]>0.60){
            window.dispatchEvent(new KeyboardEvent('keydown',  {'key':'s'}));
        }
        if(gamepad1.axes[0]<-0.60){
            window.dispatchEvent(new KeyboardEvent('keydown',  {'key':'a'}));
        }
        if(gamepad1.axes[0]>0.60){
            window.dispatchEvent(new KeyboardEvent('keydown',  {'key':'d'}));
        }

	      //console.log(gamepad1.axes[0])
	      //console.log(gamepad1.axes[1])
        if(gamepad1.axes[0]==0.003921627998352051 && gamepad1.axes[1]==0.003921627998352051 /* && gamepad1.axes[9]==3.2857141494750977 */){
            window.dispatchEvent(new KeyboardEvent('keyup',  {'key':'w'}));
        }

        //console.log("9 == "+ gamepad1.axes[9])

        // Arrow kyes
        if(gamepad1.axes[9]==-1){
            window.dispatchEvent(new KeyboardEvent('keydown',  {'key':'w'}));
        }
        if(gamepad1.axes[9]==1){
            window.dispatchEvent(new KeyboardEvent('keydown',  {'key':'w'}));
 	    window.dispatchEvent(new KeyboardEvent('keydown',  {'key':'a'}));
        }
        if(gamepad1.axes[9]==0.14285719394683838){
            window.dispatchEvent(new KeyboardEvent('keydown',  {'key':'s'}));
        }
        if(gamepad1.axes[9]==-0.1428571343421936){
            window.dispatchEvent(new KeyboardEvent('keydown',  {'key':'s'}));
	    window.dispatchEvent(new KeyboardEvent('keydown',  {'key':'d'}));
        }
        if(gamepad1.axes[9]==0.7142857313156128){
            window.dispatchEvent(new KeyboardEvent('keydown',  {'key':'a'}));
        }
        if(gamepad1.axes[9]==-0.7142857313156128){
            window.dispatchEvent(new KeyboardEvent('keydown',  {'key':'w'}));
	    window.dispatchEvent(new KeyboardEvent('keydown',  {'key':'d'}));
        }
        if(gamepad1.axes[9]==-0.4285714030265808){
            window.dispatchEvent(new KeyboardEvent('keydown',  {'key':'d'}));
        }
        if(gamepad1.axes[9]==0.4285714626312256){
            window.dispatchEvent(new KeyboardEvent('keydown',  {'key':'s'}));
	    window.dispatchEvent(new KeyboardEvent('keydown',  {'key':'a'}));
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
        if(gamepad2.buttons[0].pressed==true || gamepad2.buttons[1].pressed==true || gamepad2.buttons[2].pressed==true || gamepad2.buttons[3].pressed==true){
            window.dispatchEvent(new KeyboardEvent('keydown',  {'key':'Enter'}));
        }

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

        if(gamepad2.buttons[12].pressed==false && gamepad2.buttons[13].pressed==false && gamepad2.buttons[14].pressed==false && gamepad2.buttons[15].pressed==false){
          window.dispatchEvent(new KeyboardEvent('keyup',  {'key':'ArrowUp'}));
        }



        // CODE FOR ARCADE CONTROLLER
        //console.log("PLAYER 2")
        //console.log("0 == "+ gamepad2.axes[0]) // Left = -1 || Right = 1
        //console.log("1 == "+ gamepad2.axes[1]) // Up = -1 || Down = 1

        // Joystick
        if(gamepad2.axes[1]<-0.60){
            window.dispatchEvent(new KeyboardEvent('keydown',  {'key':'ArrowUp'}));
        }
        if(gamepad2.axes[1]>0.60){
            window.dispatchEvent(new KeyboardEvent('keydown',  {'key':'ArrowDown'}));
        }
        if(gamepad2.axes[0]<-0.60){
            window.dispatchEvent(new KeyboardEvent('keydown',  {'key':'ArrowLeft'}));
        }
        if(gamepad2.axes[0]>0.60){
            window.dispatchEvent(new KeyboardEvent('keydown',  {'key':'ArrowRight'}));
        }

        if(gamepad2.axes[0]==0.003921627998352051 && gamepad2.axes[1]==-0.003921568393707275 /* && gamepad2.axes[9]==3.2857141494750977 */ ){
            window.dispatchEvent(new KeyboardEvent('keyup',  {'key':'ArrowUp'}));
        }

        //console.log("9 == "+ gamepad2.axes[9])

	console.log(gamepad2.axes[9])
        // Arrow kyes
        if(gamepad2.axes[9]==-1){
            window.dispatchEvent(new KeyboardEvent('keydown',  {'key':'ArrowUp'}));
        }
        if(gamepad2.axes[9]==1){
            window.dispatchEvent(new KeyboardEvent('keydown',  {'key':'ArrowUp'}));
 	    window.dispatchEvent(new KeyboardEvent('keydown',  {'key':'ArrowLeft'}));
        }
        if(gamepad2.axes[9]==0.14285719394683838){
            window.dispatchEvent(new KeyboardEvent('keydown',  {'key':'ArrowDown'}));
        }
        if(gamepad2.axes[9]==-0.1428571343421936){
            window.dispatchEvent(new KeyboardEvent('keydown',  {'key':'ArrowDown'}));
	    window.dispatchEvent(new KeyboardEvent('keydown',  {'key':'ArrowRight'}));
        }
        if(gamepad2.axes[9]==0.7142857313156128){
            window.dispatchEvent(new KeyboardEvent('keydown',  {'key':'ArrowLeft'}));
        }
        if(gamepad2.axes[9]==-0.7142857313156128){
            window.dispatchEvent(new KeyboardEvent('keydown',  {'key':'ArrowUp'}));
	    window.dispatchEvent(new KeyboardEvent('keydown',  {'key':'ArrowRight'}));
        }
        if(gamepad2.axes[9]==-0.4285714030265808){
            window.dispatchEvent(new KeyboardEvent('keydown',  {'key':'ArrowRight'}));
        }
        if(gamepad2.axes[9]==0.4285714626312256){
            window.dispatchEvent(new KeyboardEvent('keydown',  {'key':'ArrowDown'}));
	    window.dispatchEvent(new KeyboardEvent('keydown',  {'key':'ArrowLeft'}));
        }
    }
}
