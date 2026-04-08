export class AutocompleteServiceManager {
	private static instance: AutocompleteServiceManager | null = null

	static getInstance(): AutocompleteServiceManager | null {
		return AutocompleteServiceManager.instance
	}

	load(): void {
		console.log("[Kilo New] AutocompleteServiceManager.load: stub")
	}

	dispose(): void {
		AutocompleteServiceManager.instance = null
	}
}
