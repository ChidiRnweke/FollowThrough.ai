<script lang="ts">
  let { class: className = '' }: { class?: string } = $props();
</script>

<svg
  xmlns="http://www.w3.org/2000/svg"
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="1.5"
  stroke-linecap="round"
  stroke-linejoin="round"
  class={className}
  aria-hidden="true"
>
  <path d="M 15 3 H 6.5 C 5.67 3 5 3.67 5 4.5 V 19.5 C 5 20.33 5.67 21 6.5 21 H 17.5 C 18.33 21 19 20.33 19 19.5 V 7 L 15 3 Z" />
  <polyline points="15,3 15,7 19,7" />
  <line x1="12" y1="12" x2="12" y2="17" />
  <line x1="9.5" y1="14.5" x2="14.5" y2="14.5" />
</svg>
