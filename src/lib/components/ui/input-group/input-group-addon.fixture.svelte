<script lang="ts">
	import * as InputGroup from './index.js';
</script>

<InputGroup.Root>
	<InputGroup.Addon>
		<button type="button" aria-label="Toggle unit">kg</button>
	</InputGroup.Addon>
	<InputGroup.Input placeholder="Weight" />
	<InputGroup.Addon>
		<span aria-hidden="true">Search</span>
	</InputGroup.Addon>
</InputGroup.Root>
