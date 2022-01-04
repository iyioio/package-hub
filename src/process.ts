import { exec } from "child_process";
import { printCmd } from "./common";

let exitListeners:(()=>void)[]=[];

export function processInit()
{
    // Keeps the process alive
    const heartBeat=setInterval(()=>{
        // do nothing here
    },1000*60*60*24);

    onExit(()=>{
        clearInterval(heartBeat);
    })

    process.on('SIGINT', () => {
        cleanUp();
        process.exit(0);
    });
}

export function onExit(callback:()=>void)
{
    exitListeners.push(callback);
    return ()=>{
        const i=exitListeners.indexOf(callback);
        if(i!==-1){
            exitListeners.splice(i,1);
        }
    }
}

export function cleanUp()
{
    const listeners=exitListeners;
    exitListeners=[];
    console.log(`\nEnding ${listeners.length} task(s)`);
    for(const d of listeners){
        try{
            d();
        }catch(ex:any){
            console.error('Error calling dispose callback',ex?.message)
        }
    }
}

export function cmd(name:string,cmd:string){
    console.info(cmd);
    const proc=exec(cmd);
    proc.stdout?.on('data',data=>printCmd(name,data.toString(),false));

    proc.stderr?.on('data',data=>printCmd(name,data.toString(),true));

    proc.on('exit', code=>printCmd(name,`[[EXITED(${code})]]`,false));
    return proc;
}