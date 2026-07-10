<script lang="ts">
	import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card';
	import { Utensils, ShieldCheck } from 'lucide-svelte';
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();
</script>

<svelte:head><title>CMS — Menyue</title></svelte:head>
<h1 class="text-3xl font-semibold">Good to see you, {data.user.username}</h1>
<p class="mt-2 text-muted-foreground">Your role: {data.user.role}</p>
<div class="mt-8 grid gap-4 md:grid-cols-2">
	<Card
		><CardHeader
			><CardTitle><Utensils class="mr-2 inline" size={18} />Menu control</CardTitle></CardHeader
		><CardContent>Manage categories, dishes, promotions and hero content.</CardContent></Card
	><Card
		><CardHeader
			><CardTitle><ShieldCheck class="mr-2 inline" size={18} />Server-enforced access</CardTitle
			></CardHeader
		><CardContent>Every privileged mutation checks role capabilities on the server.</CardContent
		></Card
	>
</div>
