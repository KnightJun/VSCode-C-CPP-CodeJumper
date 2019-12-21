import { basename, extname, join, dirname, relative, resolve, normalize } from 'path';
import { existsSync, futimes } from 'fs';
import { execSync, exec, ExecException, ExecSyncOptionsWithStringEncoding } from 'child_process';

export interface GtagsLocation {
    line : number;
    filePath : string;
    desc : string;
}

export class GtagsCtl {
    workPath: string;
    globalPath: string;
    gtagsPath: string = "";
    globalVer: string;
    errorStr: string = "";
    initFlat: boolean = false;
    constructor(workPath: string, globalPath: string = "") {
        this.workPath = workPath;
        this.globalPath = globalPath;
        /* 检查global有效性 */
        this.globalVer = this.execGlobalSync("--version").split("\r\n")[0];
        let inx = this.globalVer.indexOf("(GNU GLOBAL)");
        if(inx < 0){
            this.errorStr = "Can't find global.Please set global path or add the path to Environment variable";
            return;
        }
        /* 获取gtags路径 */
        this.gtagsPath = this.execGlobalSync("-p");
        inx = this.gtagsPath.indexOf("not found");
        if (inx >= 0) {
            this.errorStr = "Gtags files (GTAGS, GRTAGS, GPATH) could not be found in this or parent directory";
            return;
        }
        this.initFlat = true;
    }

    public listFiles(keyWord: string): string[] | undefined {
        return this.getLineList("-aP " + keyWord);
    }

    public listSymbol(keyWord: string): string[] | undefined {
        return this.getLineList("-c " + keyWord);
    }

    public findDefinition(symbol: string): GtagsLocation[] | undefined {
        return this.getCxrefList("-ax " + symbol);
    }

    public findReference(symbol: string): GtagsLocation[] | undefined {
        return this.getCxrefList("-arx " + symbol);
    }
    
    private getCxrefList(argv: string): GtagsLocation[] | undefined {
        let stdout = this.execGlobalSync(argv);
        if (stdout == "") return undefined;
        const regex = /^(\w+)\s+(\d+)\s(\S+)\s(.+)$/gm;
        let findResult = regex.exec(stdout);
        let returnSet : GtagsLocation[] = [];
        while (findResult !== null) {
            // This is necessary to avoid infinite loops with zero-width matches
            if (findResult.index === regex.lastIndex) {
                regex.lastIndex++;
            }
            returnSet.push({line:Number(findResult[2]) - 1, filePath : findResult[3], desc : findResult[4]});
            findResult = regex.exec(stdout);
        }
        return returnSet;
    }

    private getLineList(argv: string): string[] | undefined {
        let stdout = this.execGlobalSync(argv);
        if (stdout == "") return undefined;
        let ret = stdout.split("\r\n");
        ret.pop();
        return ret;
    }

    private execGlobalSync(argv: string): string {
        let exeOpt: ExecSyncOptionsWithStringEncoding;
        exeOpt = { cwd: this.workPath, encoding: "utf8" };
        let cmdStr = (this.globalPath ? this.globalPath : "global") + " " + argv;
        return execSync(cmdStr, exeOpt);
    }
}