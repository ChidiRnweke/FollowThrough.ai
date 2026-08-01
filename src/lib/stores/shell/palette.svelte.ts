class PaletteStore {
	isOpen = $state(false);

	open(): void {
		this.isOpen = true;
	}
	close(): void {
		this.isOpen = false;
	}
	toggle(): void {
		this.isOpen = !this.isOpen;
	}
}

export const palette = new PaletteStore();
