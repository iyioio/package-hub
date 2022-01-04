import path from "path";
import { v4 as uuid } from 'uuid';
import { backupExtension } from "./common";
import { getPackageInfo } from "./package-info";
import { onExit } from "./process";
import { ProjectTarget } from "./types";

export function useTargetProject(projectPath:string, packageName:string, sessionName:string)
{
    projectPath=path.resolve(projectPath);
    const id=uuid();
    const np=path.join(projectPath,'node_modules',packageName.split('..').join('__'));

    const target:ProjectTarget={
        id,
        projectPath,
        packageName,
        nodeModulePath:np,
        nodeModuleBackupPath:np+backupExtension,
    }

    const {createDb,cleanDb}=getPackageInfo(packageName);

    createDb(target);

    onExit(()=>{
        cleanDb();
    })
}