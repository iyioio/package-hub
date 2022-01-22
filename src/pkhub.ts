#!/usr/bin/env node

import chalk from 'chalk';
import { PackageHubRunOptions, runPackageHubWithOptions } from './commands';
import { verbose } from './common';
import { exit } from './process';

try{

    const options:PackageHubRunOptions={
        args:[...process.argv],
        exitAtEnd:true
    }

    runPackageHubWithOptions(options);
    
}catch(ex:any){
    if(verbose){
        console.error(chalk.red('package-hub encountered an error'),ex);
    }else{
        console.error(chalk.red('package-hub encountered an error'),ex.message);
    }
    exit();
    process.exitCode=1;
}
