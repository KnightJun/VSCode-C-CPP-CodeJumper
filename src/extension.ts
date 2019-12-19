// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { basename,extname,join, dirname, relative,resolve, normalize} from 'path';
import { existsSync, futimes } from 'fs';
import { execSync, exec, ExecException,ExecSyncOptionsWithStringEncoding } from 'child_process';

enum GtagsFindType{
	Reference = "-arx",
	Definition = "-ax"
}

let gtagsRoot : string | undefined;
let gtagsGlobalPath : string | undefined;

export class DefinitionProvider implements vscode.DefinitionProvider{
	provideDefinition(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): 
	vscode.ProviderResult<vscode.Definition | vscode.DefinitionLink[]>{
		let range = document.getWordRangeAtPosition(position)
		let word = document.getText(range);
		let locations = FindGtagsByWord(word, GtagsFindType.Definition);
		return locations;
	}
}

export class ReferenceProvider implements vscode.ReferenceProvider{
	provideReferences(document: vscode.TextDocument, position: vscode.Position, context: vscode.ReferenceContext, token: vscode.CancellationToken): 
	vscode.ProviderResult<vscode.Location[]>{
		let range = document.getWordRangeAtPosition(position)
		let word = document.getText(range);
		let locations = FindGtagsByWord(word, GtagsFindType.Reference);
		return locations;
	}
}

export class CompletionItemProvider implements vscode.CompletionItemProvider{
	provideCompletionItems(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken, context: vscode.CompletionContext): 
	vscode.ProviderResult<vscode.CompletionItem[] | vscode.CompletionList>{
		let range = document.getWordRangeAtPosition(position)
		let word = document.getText(range);
		let completionList = FindGtagsCompletion(word);
		return completionList;
	}
}


function FindGtagsRoot():string | undefined{
	if(! vscode.workspace.workspaceFolders){
		return undefined;
	}
	let wordPath = vscode.workspace.workspaceFolders[0].uri.fsPath;
	let wordPath_last = wordPath;
	let rootPath:string|undefined;
	rootPath = undefined;
	do {
		wordPath = wordPath_last;
		console.log("find path:" + wordPath + "\\GTAGS");
		if(existsSync(wordPath + "\\GTAGS")){
			return wordPath;
		}
		wordPath_last = normalize(wordPath + "/..");
	} while (wordPath_last != wordPath);
	return undefined;
}

function FindGtagsCompletion(word:string):vscode.CompletionList{
	let cplList = new vscode.CompletionList();
	var cmdStr = gtagsGlobalPath + " -c " + word;
	let wordPath = (<vscode.WorkspaceFolder[]>vscode.workspace.workspaceFolders)[0].uri.fsPath;
	let exeOpt : ExecSyncOptionsWithStringEncoding;
	exeOpt =  {cwd : wordPath, encoding: "utf8"};
	let stdout = execSync(cmdStr,exeOpt);
	let tokenList = stdout.split("\r\n");
	tokenList.map(token => {
		cplList.items.push(new vscode.CompletionItem(token));
	})
	cplList.isIncomplete = false;
	return cplList;
}

function FindGtagsFile(word:string) : string[]{
	let cplList = new vscode.CompletionList();
	var cmdStr = gtagsGlobalPath + " -aP " + word;
	let wordPath = (<vscode.WorkspaceFolder[]>vscode.workspace.workspaceFolders)[0].uri.fsPath;
	let exeOpt : ExecSyncOptionsWithStringEncoding;
	exeOpt =  {cwd : wordPath, encoding: "utf8"};
	let stdout = execSync(cmdStr,exeOpt);
	let tokenList = stdout.split("\r\n");
	return tokenList;
}

function ListFile() {
	let items: vscode.QuickPickItem[] = [];
	vscode.window.showInputBox({ignoreFocusOut:true, 
		placeHolder:'File name key word.', prompt:'None for all file'}).then(
			keyWord =>{
				console.log("|" + keyWord + "|")
				if(keyWord == undefined)keyWord = "";
				let filePaths = FindGtagsFile(keyWord);
				filePaths.map(fPath =>{
					fPath = relative(<string>gtagsRoot, fPath)
					items.push({label:basename(fPath), description:dirname(fPath)})
				})
				vscode.window.showQuickPick(items, {matchOnDescription:true}).then(
					pickItem => {
						if(pickItem == undefined)return;
						let fPath = join(<string>gtagsRoot , <string>pickItem.description , pickItem.label);
						let fileUri = vscode.Uri.file(fPath);
						vscode.window.showTextDocument(fileUri);
					}
				);
			}
		)
}
function FindGtagsByWord(word:string, ftype : GtagsFindType):vscode.Location[] | undefined{
	let locations : vscode.Location[] = [];
	var cmdStr = gtagsGlobalPath + " " + ftype + " " + word;
	let wordPath = (<vscode.WorkspaceFolder[]>vscode.workspace.workspaceFolders)[0].uri.fsPath;
	let exeOpt : ExecSyncOptionsWithStringEncoding;
	exeOpt =  {cwd : wordPath, encoding: "utf8"};
	let stdout = execSync(cmdStr,exeOpt);
	const regex = /^(\w+)\s+(\d+)\s(\S+)\s(.+)$/gm;
	// console.log(stdout);
	let findResult = regex.exec(stdout);
	while (findResult !== null) {
		// This is necessary to avoid infinite loops with zero-width matches
		if (findResult.index === regex.lastIndex) {
			regex.lastIndex++;
		}
		let pos = new vscode.Position(Number(findResult[2]) - 1, 0);
		let loction = new vscode.Location(vscode.Uri.file(findResult[3]), new vscode.Range(pos, pos));
		locations.push(loction);
		findResult = regex.exec(stdout);
	}
	if(locations.length == 0) return undefined;
	return locations;
}

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "gtagsc" is now active!');
	gtagsRoot = FindGtagsRoot();
	if(gtagsRoot == undefined){
		vscode.window.showErrorMessage("Gtags files (GTAGS, GRTAGS, GPATH) could not be found in this or parent directory");
		return;
	}
	gtagsGlobalPath = vscode.workspace.getConfiguration().get<string>('gtagsSupport.globalPath');
	if(gtagsGlobalPath == undefined || existsSync(gtagsGlobalPath) == false){
		vscode.window.showErrorMessage("Setting Error : Gtags can't find in " + gtagsGlobalPath);
		return;
	}
	let defineProcider = new DefinitionProvider();
	let referenceProvider = new ReferenceProvider();
	let completionItemProvider = new CompletionItemProvider();
	context.subscriptions.push(
		vscode.commands.registerCommand("Global.FindFile", ListFile),
		vscode.languages.registerDefinitionProvider(["c","h","cpp"], defineProcider),
		vscode.languages.registerReferenceProvider(["c","h","cpp"], referenceProvider),
		vscode.languages.registerCompletionItemProvider(["c","h","cpp"], completionItemProvider)
		);
}

// this method is called when your extension is deactivated
export function deactivate() {}
