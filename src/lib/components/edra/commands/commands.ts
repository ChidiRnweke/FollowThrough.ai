import type { Component } from 'svelte';
import * as Icon from '$lib/components/icons';
import { isTextSelection, type Editor } from '@tiptap/core';
import type { Node } from '@tiptap/pm/model';
import { ISMAC } from './utils.js';
import strings from './strings.js';

export interface EdraCommand {
	name: string;
	icon: Component<{ class?: string }>;
	tooltip: string;
	/** Extra words the slash menu matches on, for names a writer would not guess. */
	aliases?: readonly string[];
	shortCut?: string;
	onClick?: (editor: Editor) => void;
	turnInto?: (editor: Editor, node: Node, pos: number) => void;
	isActive?: (editor: Editor) => boolean;
	clickable?: (editor: Editor) => boolean;
}

export const commands: Record<string, EdraCommand[]> = {
	'undo-redo': [
		{
			icon: Icon.Undo,
			name: 'undo',
			tooltip: strings.command.undo,
			shortCut: `${ISMAC ? '⌘' : 'Ctrl+'}Z`,
			onClick: (editor) => {
				editor.chain().focus().undo().run();
			},
			clickable: (editor) => {
				return editor.can().undo();
			}
		},
		{
			icon: Icon.Redo,
			name: 'redo',
			tooltip: strings.command.redo,
			shortCut: `${ISMAC ? '⌘' : 'Ctrl+'}Y`,
			onClick: (editor) => {
				editor.chain().focus().redo().run();
			},
			clickable: (editor) => {
				return editor.can().redo();
			}
		}
	],
	headings: [
		{
			icon: Icon.Heading1,
			name: 'h1',
			tooltip: strings.command.h1,
			shortCut: `${ISMAC ? '⌘⌥' : 'Ctrl+Alt+'}1`,
			onClick: (editor) => {
				editor.chain().focus().toggleHeading({ level: 1 }).run();
			},
			turnInto: (editor, node, pos) => {
				editor.chain().setNodeSelection(pos).setHeading({ level: 1 }).run();
			},
			clickable: (editor) => {
				return editor.can().toggleHeading({ level: 1 });
			},
			isActive: (editor) => {
				return editor.isActive('heading', { level: 1 });
			}
		},
		{
			icon: Icon.Heading2,
			name: 'h2',
			tooltip: strings.command.h2,
			shortCut: `${ISMAC ? '⌘⌥' : 'Ctrl+Alt+'}2`,
			onClick: (editor) => {
				editor.chain().focus().toggleHeading({ level: 2 }).run();
			},
			turnInto: (editor, node, pos) => {
				editor.chain().setNodeSelection(pos).setHeading({ level: 2 }).run();
			},
			clickable: (editor) => {
				return editor.can().toggleHeading({ level: 2 });
			},
			isActive: (editor) => {
				return editor.isActive('heading', { level: 2 });
			}
		},
		{
			icon: Icon.Heading3,
			name: 'h3',
			tooltip: strings.command.h3,
			shortCut: `${ISMAC ? '⌘⌥' : 'Ctrl+Alt+'}3`,
			onClick: (editor) => {
				editor.chain().focus().toggleHeading({ level: 3 }).run();
			},
			turnInto: (editor, node, pos) => {
				editor.chain().setNodeSelection(pos).setHeading({ level: 3 }).run();
			},
			clickable: (editor) => {
				return editor.can().toggleHeading({ level: 3 });
			},
			isActive: (editor) => {
				return editor.isActive('heading', { level: 3 });
			}
		},
		{
			icon: Icon.Heading4,
			name: 'h4',
			tooltip: strings.command.h4,
			shortCut: `${ISMAC ? '⌘⌥' : 'Ctrl+Alt+'}4`,
			onClick: (editor) => {
				editor.chain().focus().toggleHeading({ level: 4 }).run();
			},
			turnInto: (editor, node, pos) => {
				editor.chain().setNodeSelection(pos).setHeading({ level: 4 }).run();
			},
			clickable: (editor) => {
				return editor.can().toggleHeading({ level: 4 });
			},
			isActive: (editor) => {
				return editor.isActive('heading', { level: 4 });
			}
		}
	],
	'text-formatting': [
		{
			icon: Icon.Link,
			name: 'link',
			tooltip: strings.command.link,
			onClick: (editor) => {
				if (editor.isActive('link')) {
					editor.chain().focus().unsetLink().run();
				} else {
					const url = window.prompt('Enter the URL of the link:');
					if (url) {
						editor.chain().focus().toggleLink({ href: url }).run();
					}
				}
			},
			isActive: (editor) => {
				return editor.isActive('link');
			}
		},
		{
			icon: Icon.Paragraph,
			name: 'paragraph',
			tooltip: 'Paragraph',
			shortCut: `${ISMAC ? '⌘⇧' : 'Ctrl+Shift+'}0`,
			onClick: (editor) => {
				editor.chain().focus().setParagraph().run();
			},
			turnInto: (editor, node, pos) => {
				editor.chain().setNodeSelection(pos).setParagraph().run();
			},
			clickable: (editor) => {
				return editor.can().setParagraph();
			},
			isActive: (editor) => {
				return editor.isActive('paragraph');
			}
		},
		{
			icon: Icon.Bold,
			name: 'bold',
			tooltip: strings.command.bold,
			shortCut: `${ISMAC ? '⌘' : 'Ctrl+'}B`,
			onClick: (editor) => {
				editor.chain().focus().toggleBold().run();
			},
			turnInto: (editor, node, pos) => {
				editor.chain().setNodeSelection(pos).setMark('bold').run();
			},
			clickable: (editor) => {
				return editor.can().toggleBold();
			},
			isActive: (editor) => {
				return editor.isActive('bold');
			}
		},
		{
			icon: Icon.Italic,
			name: 'italic',
			tooltip: strings.command.italic,
			shortCut: `${ISMAC ? '⌘' : 'Ctrl+'}I`,
			onClick: (editor) => {
				editor.chain().focus().toggleItalic().run();
			},
			turnInto: (editor, node, pos) => {
				editor.chain().setNodeSelection(pos).setMark('italic').run();
			},
			clickable: (editor) => {
				return editor.can().toggleItalic();
			},
			isActive: (editor) => {
				return editor.isActive('italic');
			}
		},
		{
			icon: Icon.Underline,
			name: 'underline',
			tooltip: strings.command.underline,
			shortCut: `${ISMAC ? '⌘' : 'Ctrl+'}U`,
			onClick: (editor) => {
				editor.chain().focus().toggleUnderline().run();
			},
			turnInto: (editor, node, pos) => {
				editor.chain().setNodeSelection(pos).setMark('underline').run();
			},
			clickable: (editor) => {
				return editor.can().toggleUnderline();
			},
			isActive: (editor) => {
				return editor.isActive('underline');
			}
		},
		{
			icon: Icon.Strikethrough,
			name: 'strikethrough',
			tooltip: strings.command.strikethrough,
			shortCut: `${ISMAC ? '⌘⇧' : 'Ctrl+Shift+'}S`,
			onClick: (editor) => {
				editor.chain().focus().toggleStrike().run();
			},
			turnInto: (editor, node, pos) => {
				editor.chain().setNodeSelection(pos).setMark('strike').run();
			},
			clickable: (editor) => {
				return editor.can().toggleStrike();
			},
			isActive: (editor) => {
				return editor.isActive('strike');
			}
		},
		{
			icon: Icon.Quote,
			name: 'blockQuote',
			tooltip: strings.command.blockQuote,
			shortCut: `${ISMAC ? '⌘⇧' : 'Ctrl+Shift+'}B`,
			onClick: (editor) => {
				editor.chain().focus().toggleBlockquote().run();
			},
			turnInto: (editor, node, pos) => {
				editor.chain().setNodeSelection(pos).toggleBlockquote().run();
			},
			clickable: (editor) => {
				return editor.can().toggleBlockquote();
			},
			isActive: (editor) => {
				return editor.isActive('blockquote');
			}
		},
		{
			icon: Icon.Code,
			name: 'code',
			tooltip: strings.command.code,
			shortCut: `${ISMAC ? '⌘' : 'Ctrl+'}E`,
			onClick: (editor) => {
				editor.chain().focus().toggleCode().run();
			},
			turnInto: (editor, node, pos) => {
				editor.chain().setNodeSelection(pos).toggleCodeBlock().run();
			},
			clickable: (editor) => {
				return editor.can().toggleCode();
			},
			isActive: (editor) => {
				return editor.isActive('code');
			}
		},
		{
			icon: Icon.FileCode,
			name: 'codeBlock',
			tooltip: strings.command.codeBlock,
			shortCut: `${ISMAC ? '⌘⌥' : 'Ctrl+Shift+'}C`,
			onClick: (editor) => {
				editor.chain().focus().toggleCodeBlock({ language: 'plaintext' }).run();
			},
			turnInto: (editor, node, pos) => {
				editor.chain().setNodeSelection(pos).toggleCodeBlock({ language: 'plaintext' }).run();
			},
			clickable: (editor) => {
				return editor.can().toggleCodeBlock({ language: 'plaintext' });
			},
			isActive: (editor) => {
				return editor.isActive('codeBlock');
			}
		},
		{
			icon: Icon.Superscript,
			name: 'superscript',
			tooltip: strings.command.superscript,
			shortCut: `${ISMAC ? '⌘' : 'Ctrl+'}.`,
			onClick: (editor) => {
				editor.chain().focus().toggleSuperscript().run();
			},
			clickable: (editor) => {
				return editor.can().toggleSuperscript();
			},
			isActive: (editor) => {
				return editor.isActive('superscript');
			}
		},
		{
			icon: Icon.Subscript,
			name: 'subscript',
			tooltip: strings.command.subscript,
			shortCut: `${ISMAC ? '⌘' : 'Ctrl+'},`,
			onClick: (editor) => {
				editor.chain().focus().toggleSubscript().run();
			},
			clickable: (editor) => {
				return editor.can().toggleSubscript();
			},
			isActive: (editor) => {
				return editor.isActive('subscript');
			}
		}
	],
	alignment: [
		{
			icon: Icon.AlignLeft,
			name: 'align-left',
			tooltip: strings.command.alignLeft,
			shortCut: `${ISMAC ? '⌘⇧' : 'Ctrl+Shift+'}L`,
			onClick: (editor) => {
				editor.chain().focus().toggleTextAlign('left').run();
			},
			turnInto: (editor, node, pos) => {
				editor.chain().setNodeSelection(pos).toggleTextAlign('left').run();
			},
			clickable: (editor) => {
				return editor.can().toggleTextAlign('left');
			},
			isActive: (editor) => editor.isActive({ textAlign: 'left' })
		},
		{
			icon: Icon.AlignCenter,
			name: 'align-center',
			tooltip: strings.command.alignCenter,
			shortCut: `${ISMAC ? '⌘⇧' : 'Ctrl+Shift+'}E`,
			onClick: (editor) => {
				editor.chain().focus().toggleTextAlign('center').run();
			},
			turnInto: (editor, node, pos) => {
				editor.chain().setNodeSelection(pos).toggleTextAlign('center').run();
			},
			clickable: (editor) => {
				return editor.can().toggleTextAlign('center');
			},
			isActive: (editor) => editor.isActive({ textAlign: 'center' })
		},
		{
			icon: Icon.AlignRight,
			name: 'align-right',
			tooltip: strings.command.alignRight,
			shortCut: `${ISMAC ? '⌘⇧' : 'Ctrl+Shift+'}R`,
			onClick: (editor) => {
				editor.chain().focus().toggleTextAlign('right').run();
			},
			turnInto: (editor, node, pos) => {
				editor.chain().setNodeSelection(pos).toggleTextAlign('right').run();
			},
			clickable: (editor) => {
				return editor.can().toggleTextAlign('right');
			},
			isActive: (editor) => editor.isActive({ textAlign: 'right' })
		},
		{
			icon: Icon.AlignJustify,
			name: 'align-justify',
			tooltip: strings.command.alignJustify,
			shortCut: `${ISMAC ? '⌘⇧' : 'Ctrl+Shift+'}J`,
			onClick: (editor) => {
				editor.chain().focus().toggleTextAlign('justify').run();
			},
			turnInto: (editor, node, pos) => {
				editor.chain().setNodeSelection(pos).toggleTextAlign('justify').run();
			},
			clickable: (editor) => {
				return editor.can().toggleTextAlign('justify');
			},
			isActive: (editor) => editor.isActive({ textAlign: 'justify' })
		}
	],
	lists: [
		{
			icon: Icon.ListBullet,
			name: 'bulletList',
			tooltip: strings.command.bulletList,
			shortCut: `${ISMAC ? '⌘⇧' : 'Ctrl+Shift+'}8`,
			onClick: (editor) => {
				editor.chain().focus().toggleBulletList().run();
			},
			turnInto: (editor, node, pos) => {
				editor.chain().setNodeSelection(pos).toggleBulletList().run();
			},
			isActive: (editor) => editor.isActive('bulletList')
		},
		{
			icon: Icon.ListOrdered,
			name: 'orderedList',
			tooltip: strings.command.orderedList,
			shortCut: `${ISMAC ? '⌘⇧' : 'Ctrl+Shift+'}7`,
			onClick: (editor) => {
				editor.chain().focus().toggleOrderedList().run();
			},
			turnInto: (editor, node, pos) => {
				editor.chain().setNodeSelection(pos).toggleOrderedList().run();
			},
			clickable: (editor) => {
				return editor.can().toggleOrderedList();
			},
			isActive: (editor) => {
				return editor.isActive('orderedList');
			}
		},
		{
			icon: Icon.ListChecks,
			name: 'taskList',
			tooltip: strings.command.taskList,
			shortCut: `${ISMAC ? '⌘⇧' : 'Ctrl+Shift+'}9`,
			onClick: (editor) => {
				editor.chain().focus().toggleTaskList().run();
			},
			turnInto: (editor, node, pos) => {
				editor.chain().setNodeSelection(pos).toggleTaskList().run();
			},
			clickable: (editor) => {
				return editor.can().toggleTaskList();
			},
			isActive: (editor) => {
				return editor.isActive('taskList');
			}
		}
	],
	media: [
		{
			icon: Icon.Image,
			name: 'image-placeholder',
			tooltip: strings.command.imagePlaceholder,
			onClick: (editor) => {
				editor.chain().focus().insertMediaPlaceholder({ mediaType: 'image' }).run();
			},
			isActive: (editor) => editor.isActive('mediaPlaceholder', { mediaType: 'image' })
		},
		{
			icon: Icon.Video,
			name: 'video-placeholder',
			tooltip: strings.command.videoPlaceholder,
			onClick: (editor) => {
				editor.chain().focus().insertMediaPlaceholder({ mediaType: 'video' }).run();
			},
			isActive: (editor) => editor.isActive('mediaPlaceholder', { mediaType: 'video' })
		},
		{
			icon: Icon.Audio,
			name: 'audio-placeholder',
			tooltip: strings.command.audioPlaceholder,
			onClick: (editor) => {
				editor.chain().focus().insertMediaPlaceholder({ mediaType: 'audio' }).run();
			},
			isActive: (editor) => editor.isActive('mediaPlaceholder', { mediaType: 'audio' })
		},
		{
			icon: Icon.CodeBlock,
			name: 'iframe-placeholder',
			tooltip: strings.command.iframePlaceholder,
			onClick: (editor) => {
				editor.chain().focus().insertMediaPlaceholder({ mediaType: 'iframe' }).run();
			},
			isActive: (editor) => editor.isActive('mediaPlaceholder', { mediaType: 'iframe' })
		}
	],
	table: [
		{
			icon: Icon.Table,
			name: 'table',
			tooltip: strings.command.table,
			onClick: (editor) => {
				// Inside a table the button removes it; cancelling must not fall through and
				// nest a new table in the one the author just chose to keep.
				if (editor.isActive('table')) {
					if (confirm('Do you really want to delete this table?')) {
						editor.chain().focus().deleteTable().run();
					}
					return;
				}
				editor.chain().focus().insertTable({ cols: 3, rows: 3, withHeaderRow: false }).run();
			},
			isActive: (editor) => editor.isActive('table')
		}
	],
	math: [
		{
			icon: Icon.Math,
			name: 'mathematics',
			tooltip: strings.command.inlineExpression,
			onClick: (editor) => {
				let latex = 'a^2 + b^2 = c^2';
				const chain = editor.chain().focus();
				if (isTextSelection(editor.view.state.selection)) {
					const { from, to } = editor.view.state.selection;
					latex = editor.view.state.doc.textBetween(from, to);
					chain.deleteRange({ from, to });
				}
				chain.insertInlineMath({ latex }).run();
			},
			isActive: (editor) => editor.isActive('inlineMath')
		},
		{
			icon: Icon.MathBlock,
			name: 'blockMathematics',
			tooltip: strings.command.blockExpression,
			onClick: (editor) => {
				const latex = 'a^2 + b^2 = c^2';
				editor.chain().focus().insertBlockMath({ latex }).run();
			},
			isActive: (editor) => editor.isActive('blockMath')
		}
	],
	diagram: [
		{
			icon: Icon.Diagram,
			name: 'mermaid',
			tooltip: 'Mermaid Diagram',
			aliases: ['diagram', 'flowchart', 'chart'],
			onClick: (editor) => {
				editor.chain().focus().setMermaid(' ').run();
			},
			isActive: (editor) => editor.isActive('mermaid')
		},
		{
			icon: Icon.Diagram,
			name: 'projectDiagram',
			tooltip: 'Project diagram',
			aliases: ['drawio', 'diagram', 'saved'],
			// Opening the picker is the app's job, not the editor's: the editor knows
			// nothing about projects or transport. It raises the request and the note
			// workspace answers it by inserting a reference.
			onClick: (editor) => {
				editor.extensionStorage.projectDiagramPicker?.open?.(editor);
			}
		}
	],
	widget: [
		{
			icon: Icon.Widget,
			name: 'widget',
			tooltip: 'Widget',
			aliases: ['checklist', 'tracker'],
			// Like the project diagram: the editor raises the request and the note answers it,
			// because creating the widget is a workspace write.
			onClick: (editor) => {
				editor.extensionStorage.widgetInserter?.insert?.(editor);
			}
		}
	]
};
