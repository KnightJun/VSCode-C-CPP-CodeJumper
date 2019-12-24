// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { basename, extname, join, dirname, relative, resolve, normalize } from 'path';
import { existsSync, futimes } from 'fs';
import { execSync, exec, ExecException, ExecSyncOptionsWithStringEncoding } from 'child_process';

import { GtagsCtl, GtagsLocation } from './gtags_ctrl';

let gtagCtl: GtagsCtl;

export class DefinitionProvider implements vscode.DefinitionProvider {
	provideDefinition(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken):
		vscode.ProviderResult<vscode.Definition | vscode.DefinitionLink[]> {
		let range = document.getWordRangeAtPosition(position)
		let word = document.getText(range);
		let glocs = gtagCtl.findDefinition(word);
		let locations : vscode.Location[] = [];
		if(!glocs)return [];
		glocs.map(gloc =>{
			locations.push(new vscode.Location(vscode.Uri.file(gloc.filePath),
				new vscode.Position(gloc.line, 0)));
		})
		return locations;
	}
}

export class ReferenceProvider implements vscode.ReferenceProvider {
	provideReferences(document: vscode.TextDocument, position: vscode.Position, context: vscode.ReferenceContext, token: vscode.CancellationToken):
		vscode.ProviderResult<vscode.Location[]> {
		let range = document.getWordRangeAtPosition(position)
		let word = document.getText(range);
		let glocs = gtagCtl.findReference(word);
		let locations : vscode.Location[] = [];
		if(!glocs)return [];
		glocs.map(gloc =>{
			locations.push(new vscode.Location(vscode.Uri.file(gloc.filePath),
				new vscode.Position(gloc.line, 0)));
		})
		return locations;
	}
}

export class CompletionItemProvider implements vscode.CompletionItemProvider {
	provideCompletionItems(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken, context: vscode.CompletionContext):
		vscode.ProviderResult<vscode.CompletionItem[] | vscode.CompletionList> {
		return new Promise<vscode.CompletionList>((resolve, reject) => {
            try {
				/* 检查设置 */
				if(!vscode.workspace.getConfiguration().get<boolean>('CodeJumper.CompletionItem'))return reject();
				let range = document.getWordRangeAtPosition(position)
				let word = document.getText(range);
				let symList = gtagCtl.listSymbol(word);
				let items : vscode.CompletionItem[] = [];
				if(!symList){
					return items;
				}
				let completionList = new vscode.CompletionList;
				symList.map(sym => {
					items.push( new vscode.CompletionItem(sym, vscode.CompletionItemKind.Function));
				});
				completionList.isIncomplete = true;
				return resolve(completionList);
            } catch (e) {
                vscode.window.showErrorMessage("provideCompletionItems failed: " + e);
                return reject(e);
            }
        });
	}
	}
function JumpToHeaderFile(uri?: vscode.Uri, position?: vscode.Position){
	if (vscode.window.activeTextEditor) {
		// take args from active editor
		let editor = vscode.window.activeTextEditor;
		let line = editor.document.lineAt(editor.selection.active.line).text
		const regex = /#include\s[<"](.*?)[>"]/gm;
		let findResult = regex.exec(line);
		if(findResult == null){
			vscode.window.showErrorMessage("Please move the cursor to the '#include' line")
			return;
		}
		let filename = findResult[1];
		ShowFileListOnTop("/"+filename + "$");
	}
}

export class VSCodeGtagsLocation extends vscode.Location {
	desc?: string;
	constructor(uri: vscode.Uri, rangeOrPosition: vscode.Range | vscode.Position) {
		super(uri, rangeOrPosition);
	}
}

export class VSCodeGtagsQuickPickItem implements vscode.QuickPickItem {
	label: string = "a";
	description?: string;
	detail?: string;
	picked?: boolean;
	alwaysShow?: boolean;
	uri?: vscode.Uri;
	line?: number;
}

function ShowSymbolListOnTop(symbol: string, glocs: GtagsLocation[]) {
	let items: VSCodeGtagsQuickPickItem[] = [];
	glocs.map(gloc => {
		items.push({
			label: symbol,
			description: relative(gtagCtl.gtagsPath, gloc.filePath),
			detail: gloc.desc,
			uri: vscode.Uri.file(gloc.filePath),
			line: gloc.line
		});
	});
	vscode.window.showQuickPick(items, { matchOnDescription: true, matchOnDetail : true,  ignoreFocusOut :true}).then(
		pickItem =>{
			if(pickItem == undefined)return;
			const defaults: vscode.TextDocumentShowOptions = {
				selection: new vscode.Range((<number>pickItem.line), 0, (<number>pickItem.line), 0)
			};
			vscode.window.showTextDocument(<vscode.Uri>pickItem.uri, defaults);
		}
	)
}

function ListSymbol() {
	let symbolItems: vscode.QuickPickItem[] = [];
	vscode.window.showInputBox({
		ignoreFocusOut: true,
		placeHolder: 'Symbol prefix.', prompt: 'List symbols which start with prefix.  If prefix is not given, print all symbols.'
	}).then(
		keyWord => {
			if (keyWord == undefined) keyWord = "";
			let symbolList = gtagCtl.listSymbol(keyWord);
			if(!symbolList){
				vscode.window.showWarningMessage("Can't find the symbol :" + keyWord);
				return;
			}
			symbolList.map(symbol => {
				symbolItems.push({ label: symbol })
			})
			vscode.window.showQuickPick(symbolItems, { matchOnDescription: true,  ignoreFocusOut :true }).then(
				pickItem => {
					if (pickItem == undefined) return;
					let glocs = gtagCtl.findDefinition(pickItem.label);
					if(!glocs)return;
					ShowSymbolListOnTop(pickItem.label, glocs);
				}
			);
		}
	)
}

function ShowFileListOnTop(keyWord: string)
{
	let items: vscode.QuickPickItem[] = [];
	let filePaths = gtagCtl.listFiles(keyWord);
	if (filePaths == undefined) {
		vscode.window.showWarningMessage("Can't find the file :" + keyWord);
		return;
	}
	if(filePaths.length == 1){
		let fileUri = vscode.Uri.file(filePaths[0]);
		vscode.window.showTextDocument(fileUri);
		return;
	}
	filePaths.map(fPath => {
		fPath = relative(gtagCtl.gtagsPath, fPath)
		items.push({ label: basename(fPath), description: dirname(fPath) })
	})
	vscode.window.showQuickPick(items, { matchOnDescription: true, ignoreFocusOut :true }).then(
		pickItem => {
			if (pickItem == undefined) return;
			let fPath = join(gtagCtl.gtagsPath, <string>pickItem.description, pickItem.label);
			let fileUri = vscode.Uri.file(fPath);
			vscode.window.showTextDocument(fileUri);
		}
	);
}

function ListFile() {
	vscode.window.showInputBox({
		ignoreFocusOut: true,
		placeHolder: 'File name key word.', prompt: 'None for all file'
	}).then(
		keyWord => {
			if (keyWord == undefined) keyWord = "";
			ShowFileListOnTop(keyWord);
		}
	)
}

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	let gtagsGlobalPath = vscode.workspace.getConfiguration().get<string>('CodeJumper.globalPath');
	let wordPath = (<vscode.WorkspaceFolder[]>vscode.workspace.workspaceFolders)[0].uri.fsPath;
	gtagCtl = new GtagsCtl(wordPath, gtagsGlobalPath);
	if (gtagCtl.initFlat == false) {
		vscode.window.showErrorMessage(gtagCtl.errorStr);
		return;
	}

	let defineProcider = new DefinitionProvider();
	let referenceProvider = new ReferenceProvider();
	let completionItemProvider = new CompletionItemProvider();
	context.subscriptions.push(
		vscode.commands.registerCommand("CodeJumper.SearchFile", ListFile),
		vscode.commands.registerCommand("CodeJumper.SearchSymbol", ListSymbol),
		vscode.commands.registerCommand("CodeJumper.JumpToHeaderFile", JumpToHeaderFile),
		vscode.languages.registerDefinitionProvider(["c", "h", "cpp"], defineProcider),
		vscode.languages.registerReferenceProvider(["c", "h", "cpp"], referenceProvider),
		vscode.languages.registerCompletionItemProvider(["c", "h", "cpp"], completionItemProvider)
	);
}

// this method is called when your extension is deactivated
export function deactivate() { }
