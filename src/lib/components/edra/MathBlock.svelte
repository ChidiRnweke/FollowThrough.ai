<script lang="ts">
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import { BubbleMenu, getEditor, useEditorState } from './index.js';
	import strings from './commands/strings.js';

	const editor = getEditor();
	const editorState = useEditorState({
		editor,
		selector: ({ editor }) => ({
			latex: editor.getAttributes('blockMath').latex as string
		})
	});
	let latex = $derived($editorState.latex);

	function updateLatex() {
		editor.commands.updateBlockMath({ latex });
	}
</script>

<!-- audit-allow: no-ad-hoc-shadow — The math bubble menu floats over the document; overlay elevation matching the ui popovers, from a primitive that is not one. -->
<BubbleMenu
	{editor}
	pluginKey="math-block-bubble-menu"
	shouldShow={(props) => {
		const { editor: propsEditor, state } = props;
		if (!propsEditor || !propsEditor.isEditable) return false;
		if (!state) return false;
		return propsEditor.isActive('blockMath');
	}}
	options={{
		shift: true,
		autoPlacement: {
			allowedPlacements: ['top', 'bottom']
		},
		strategy: 'absolute',
		scrollTarget: editor.view.dom.parentElement ?? window
	}}
	class="bg-popover h-fit w-fit flex-col items-center gap-1 rounded-lg border shadow-md"
>
	<Textarea
		bind:value={latex}
		oninput={updateLatex}
		placeholder={strings.menu.math.enterExpressionPlaceholder}
		class="h-48 w-96"
	/>
</BubbleMenu>
