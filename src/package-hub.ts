import chalk from 'chalk';
import * as fs from 'fs';
import { dbDir, lockDir, setVerbose, takeArgs, verbose } from './common';
import { cleanUp, processInit } from './process';
import { useTargetProject } from './target';
import { runHub } from './hub';


function main(){

    if(!fs.existsSync(dbDir)){
        fs.mkdirSync(dbDir,{recursive:true});
    }
    if(!fs.existsSync(lockDir)){
        fs.mkdirSync(lockDir,{recursive:true});
    }

    processInit();

    let sessionName='default';

    let targetProjects:string[]=[];

    let deleteCache=false;

    for(let i=2;i<process.argv.length;i++){
        const cmdArgs=takeArgs(process.argv,i+1);
        switch(process.argv[i].toLowerCase()){

            case '-verbose':
            case '-v':
                setVerbose(cmdArgs.length?Boolean(cmdArgs[0]):true);
                break;

            case '-exit':
                process.exit(Number(cmdArgs[0]||0));
                break;

            case '-delete-cache':
                deleteCache=cmdArgs.length?Boolean(cmdArgs[0]):true;
                break;

            case '-session':
                sessionName=cmdArgs[0]||'default';
                break;

            case "-hub":
                for(const a of cmdArgs){
                    runHub(a,sessionName);
                }
                break;

            case '-target':
                targetProjects=cmdArgs;
                break;
            
            case '-use':
                for(const p of targetProjects){
                    for(const pk of cmdArgs){
                        useTargetProject(p,pk,deleteCache,sessionName);
                    }
                }
                break;

            default:
                throw new Error(`Unknown arg [${process.argv[i].toLowerCase()}]`)
        }
        i+=cmdArgs.length;
    }
}

try{
    main()
}catch(ex:any){
    if(verbose){
        console.error(chalk.red('package-hub encountered an error'),ex);
    }else{
        console.error(chalk.red('package-hub encountered an error'),ex.message);
    }
    cleanUp();
    process.exit(1);
}
