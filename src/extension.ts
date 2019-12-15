// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { basename,extname, dirname, relative,resolve, normalize} from 'path';
import { existsSync } from 'fs';

let treeViewProvider : TreeViewProvider;
let gtagsRoot : String | undefined;

export class TreeItemNode extends vscode.TreeItem {

	label : string;
	description : string | boolean;
	uri : vscode.Uri;
	line : number;
	iconPath?: string | vscode.Uri | { light: string | vscode.Uri; dark: string | vscode.Uri } | vscode.ThemeIcon;
    constructor(
		// readonly 只可读
		public readonly loc:vscode.Location
    ){
		super(loc.uri, vscode.TreeItemCollapsibleState.None);
		this.label = basename(loc.uri.toString());
		this.description = dirname(loc.uri.fsPath).replace(<string>gtagsRoot, "");
		this.iconPath = vscode.ThemeIcon.File;
		this.uri = loc.uri;
		this.line = loc.range.start.line;
		this.iconPath = vscode.ThemeIcon.File;
    }

    // command: 为每项添加点击事件的命令
    command = {
        title: this.label,          // 标题
        command: 'itemClick',       // 命令 ID
        tooltip: this.label,        // 鼠标覆盖时的小小提示框
        arguments: [                // 向 registerCommand 传递的参数。
			this.loc
        ]
    }
    
    // iconPath： 为该项的图标因为我们是通过上面的 Map 获取的，所以我额外写了一个方法，放在下面
    // iconPath = TreeItemNode.getIconUriForLabel(this.label);

    // __filename：当前文件的路径
    // 重点讲解 Uri.file(join(__filename,'..', '..') 算是一种固定写法
    // Uri.file(join(__filename,'..','assert', ITEM_ICON_MAP.get(label)+''));   写成这样图标出不来
    // 所以小伙伴们就以下面这种写法编写
    // static getIconUriForLabel(label: string):Uri {
    //     return Uri.file(join(__filename,'..', '..' ,'src' ,'assert', ITEM_ICON_MAP.get(label)+''));
    // }
}

export class TreeViewProvider implements vscode.TreeDataProvider<TreeItemNode>{
    // 自动弹出的可以暂不理会
    private readonly _onDidChangeTreeData = new vscode.EventEmitter<TreeItemNode>();
	readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
	
	itemLocations : vscode.Location[] = [];
    // 自动弹出
    // 获取树视图中的每一项 item,所以要返回 element
    getTreeItem(element: TreeItemNode): vscode.TreeItem | Thenable<vscode.TreeItem> {
        return element;
    }

    // 自动弹出，但是我们要对内容做修改
    // 给每一项都创建一个 TreeItemNode
    getChildren(element?: TreeItemNode | undefined): vscode.ProviderResult<TreeItemNode[]> {
    
        return this.itemLocations.map(
            item => new TreeItemNode(
				item
            )
        )
    }
	setData(itemLocations : vscode.Location[]){
		this.itemLocations = itemLocations;
		this._onDidChangeTreeData.fire();
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
function FindDefineAndRefer(uri?: vscode.Uri, position?: vscode.Position){
	if (vscode.window.activeTextEditor) {
		// take args from active editor
		let editor = vscode.window.activeTextEditor;
		let range = editor.document.getWordRangeAtPosition(editor.selection.active)
		let locations : vscode.Location[] = [];
		if(range && vscode.workspace.workspaceFolders){
			let word = editor.document.getText(range);
			var exec = require('child_process').exec; 
			var cmdStr = "D:\\glo663wb\\bin\\global.exe -ax " + word;
			let wordPath = vscode.workspace.workspaceFolders[0].uri.fsPath;
			console.log(cmdStr);
			console.log(wordPath);
			exec(cmdStr, {cwd : wordPath}, function(err : string,stdout : string, stderr : string){
				if(err) {
					console.log('get weather api error:'+stderr);
				} else {
					const regex = /^(\w+)\s+(\d+)\s(\S+)\s(.+)$/gm;
					// console.log(stdout);
					let findResult = regex.exec(stdout);
					while (findResult !== null) {
						// This is necessary to avoid infinite loops with zero-width matches
						if (findResult.index === regex.lastIndex) {
							regex.lastIndex++;
						}
						let pos = new vscode.Position(Number(findResult[2]), 0);
						let loction = new vscode.Location(vscode.Uri.file(findResult[3]), new vscode.Range(pos, pos));
						locations.push(loction);
						console.log(findResult[3]);
						console.log(basename(loction.uri.toString()));
						console.log(loction.range);
						findResult = regex.exec(stdout);
					}
					if(locations.length == 1){
						
						const defaults: vscode.TextDocumentShowOptions = {
							selection : locations[0].range
						};
						let edtior = vscode.window.showTextDocument(locations[0].uri, defaults);
					}

					treeViewProvider.setData(locations);
					vscode.commands.executeCommand(`gtags-result-item.focus`);
				}
			});
		} else {
			vscode.window.showInformationMessage("未识别到单词");
		}
	}
}

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "gtagsc" is now active!');
	gtagsRoot = FindGtagsRoot();
	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	let disposable = vscode.commands.registerCommand('extension.helloWorld', () => {
		// The code you place here will be executed every time your command is executed

		// Display a message box to the user
		vscode.window.showInformationMessage('Hello World!');
	});

	context.subscriptions.push(disposable,
		vscode.commands.registerCommand('gtagsc.FindDefineAndRefer', FindDefineAndRefer)
		);
	context.subscriptions.push(disposable,
		vscode.commands.registerCommand('itemClick', (loc:vscode.Location) => {
			const defaults: vscode.TextDocumentShowOptions = {
				selection : loc.range
			};
			vscode.window.showTextDocument(loc.uri, defaults);
		}));
	// 实例化 TreeViewProvider
	treeViewProvider = new TreeViewProvider();
	
	// registerTreeDataProvider：注册树视图
	// 你可以类比 registerCommand(上面注册 Hello World)
	vscode.window.registerTreeDataProvider('gtags-result-item',treeViewProvider);
}

// this method is called when your extension is deactivated
export function deactivate() {}
