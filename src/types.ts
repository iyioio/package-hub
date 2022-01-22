export interface HubConfig
{
    packages:PackageConfig[];
}

export interface PackageConfig
{
    /**
     * Name of the package. Will be inherited by the project's name in package.json if not defined
     */
    name?:string;

    /**
     * Tags that can be used to target the project
     */
    tags?:string[];

    /**
     * Path to a project directory or package.json
     */
    path:string;

    /**
     * Build directory relative to the project's root
     */
    outDir?:string;

    /**
     * Name of a npm script to run to run the package in watch mode. If false no watch script will
     * be ran. Default value = "watch". If no watch script is defined and the project contains
     * a tsconfig.json file and the tsconfig file defines an outDir then
     * "tsc --watch --outDir {tsconfig.outDir}" will be used.
     */
    watch?:string|false;
}

export interface ProjectTarget
{
    id:string;
    projectPath:string;
    nodeModulePath:string;
    nodeModuleBackupPath?:string;
    packageName:string;
    noSymlink?:boolean;
    copyDist?:boolean;
}

export interface PackageInfo
{
    escapedName:string;
    lockPath:string;
    pkDbDir:string;
    lock:(work:()=>void)=>void;
    createDb:(addPackage?:ProjectTarget)=>void;
    cleanDb:(removePackage?:ProjectTarget,unlinkTargetPackage?:boolean)=>void;
    clearDb:()=>void;
    getTargets:()=>ProjectTarget[];
}

export interface ArgConfig {
    session?:string;
    exit?:number;
    verbose?:boolean;
    deleteCache?:boolean;
    hubs?:string[];
    targets?:string[];
    target?:string;
    use?:string[];
    args?:string[];
    preArgs?:string[];
    extends?:string[];
    clean?:boolean|'all';
    sleep?:number;
    scopes?:ArgConfig[];
    printArgs?:boolean;
    dryRun?:boolean;
}
