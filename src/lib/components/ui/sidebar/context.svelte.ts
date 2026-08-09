import { IsMobile } from '$lib/hooks/is-mobile.svelte.js';
import { getContext, setContext } from 'svelte';
import { SIDEBAR_KEYBOARD_SHORTCUT } from './constants.js';

type Getter<T> = () => T;

export type SidebarStateProps = {
	/**
	 * A getter function that returns the current open state of the sidebar.
	 * We use a getter function here to support `bind:open` on the `Sidebar.Provider`
	 * component.
	 */
	open: Getter<boolean>;

	/**
	 * A function that sets the open state of the sidebar. To support `bind:open`, we need
	 * a source of truth for changing the open state to ensure it will be synced throughout
	 * the sub-components and any `bind:` references.
	 */
	setOpen: (open: boolean) => void;

	/** A getter returning the width in pixels the sidebar should currently render at. */
	width: Getter<number>;

	/**
	 * Records a new *preferred* width in pixels. The caller decides how much of it
	 * survives the shell's space budget, so this may render narrower than asked.
	 * Called on every pointer move of a drag, so it must stay cheap.
	 */
	setWidth: (width: number) => void;

	/** Persists a settled width. Called once when a drag ends, not while it runs. */
	commitWidth: (width: number) => void;
};

class SidebarState {
	readonly props: SidebarStateProps;
	open = $derived.by(() => this.props.open());
	openMobile = $state(false);
	setOpen: SidebarStateProps['setOpen'];
	setWidth: SidebarStateProps['setWidth'];
	commitWidth: SidebarStateProps['commitWidth'];
	#isMobile: IsMobile;
	state = $derived.by(() => (this.open ? 'expanded' : 'collapsed'));
	width = $derived.by(() => this.props.width());
	/** True for the duration of a rail drag, so the shell can suppress width transitions. */
	resizing = $state(false);

	constructor(props: SidebarStateProps) {
		this.setOpen = props.setOpen;
		this.setWidth = props.setWidth;
		this.commitWidth = props.commitWidth;
		this.#isMobile = new IsMobile();
		this.props = props;
	}

	// Convenience getter for checking if the sidebar is mobile
	// without this, we would need to use `sidebar.isMobile.current` everywhere
	get isMobile() {
		return this.#isMobile.current;
	}

	// Event handler to apply to the `<svelte:window>`
	handleShortcutKeydown = (e: KeyboardEvent) => {
		if (e.key === SIDEBAR_KEYBOARD_SHORTCUT && (e.metaKey || e.ctrlKey)) {
			e.preventDefault();
			this.toggle();
		}
	};

	setOpenMobile = (value: boolean) => {
		this.openMobile = value;
	};

	startResize = () => {
		this.resizing = true;
	};

	endResize = () => {
		this.resizing = false;
	};

	toggle = () => {
		return this.#isMobile.current ? (this.openMobile = !this.openMobile) : this.setOpen(!this.open);
	};
}

const SYMBOL_KEY = 'scn-sidebar';

/**
 * Instantiates a new `SidebarState` instance and sets it in the context.
 *
 * @param props The constructor props for the `SidebarState` class.
 * @returns  The `SidebarState` instance.
 */
export function setSidebar(props: SidebarStateProps): SidebarState {
	return setContext(Symbol.for(SYMBOL_KEY), new SidebarState(props));
}

/**
 * Retrieves the `SidebarState` instance from the context. This is a class instance,
 * so you cannot destructure it.
 * @returns The `SidebarState` instance.
 */
export function useSidebar(): SidebarState {
	return getContext(Symbol.for(SYMBOL_KEY));
}
