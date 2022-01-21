import chalk from "chalk";
import { ChildProcess, exec } from "child_process";
import { printCmd, sleep } from "./common";

let exitListeners:(()=>void)[]=[];
export let isExiting=false;

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
        exit();
    });
}

export function onExit(callback:()=>void)
{
    if(isExiting){
        setTimeout(()=>{
            try{
                callback();
            }catch(ex:any){
                console.error('onExit callback error',ex?.message)
            }
        },1);
        return;
    }
    exitListeners.push(callback);
    return ()=>{
        const i=exitListeners.indexOf(callback);
        if(i!==-1){
            exitListeners.splice(i,1);
        }
    }
}

export function exit(code?:number, quite?:boolean)
{
    if(isExiting){
        return;
    }
    isExiting=true;
    if(code!==undefined){
        process.exitCode=code;
    }
    const listeners=exitListeners;
    exitListeners=[];
    if(!quite){
        console.info(chalk.blue(`\nEnding ${listeners.length} task(s) with code ${code||0}`));
    }
    for(const d of listeners){
        try{
            d();
        }catch(ex:any){
            console.error('onExit callback error',ex?.message)
        }
    }
    process.exit();
}

export function cmd(name:string,cmd:string){
    console.info(cmd);
    const proc=exec(cmd);
    proc.stdout?.on('data',data=>printCmd(name,data.toString(),false));

    proc.stderr?.on('data',data=>printCmd(name,data.toString(),true));

    proc.on('exit', code=>printCmd(name,`[[EXITED(${code})]]`,false));
    return proc;
}

export function kill(proc:ChildProcess|null)
{
    if(!proc){
        return;
    }
    let attempt=0;
    while(attempt<10){
        proc.kill();
        if(proc.killed){
            return;
        }
        attempt++;
        if(attempt>10){
            console.error('Unable to kill proc. pid:'+proc.pid);
            return;
        }
        console.warn(`kill proc attempt ${attempt} failed. Will try again. pid`+proc.pid);
        sleep(attempt*100);
    }
}