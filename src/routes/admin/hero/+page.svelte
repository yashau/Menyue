<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Textarea } from '$lib/components/ui/textarea';
	import { Label } from '$lib/components/ui/label';
	import {
		Card,
		CardContent,
		CardDescription,
		CardHeader,
		CardTitle,
	} from '$lib/components/ui/card';
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();
</script>

<Card class="max-w-2xl"
	><CardHeader
		><CardTitle><h1>Hero content</h1></CardTitle><CardDescription
			>Update the headline, image, and call to action shown to guests.</CardDescription
		></CardHeader
	><CardContent
		><form method="POST" action="?/save" enctype="multipart/form-data" class="space-y-4">
			<div>
				<Label for="title">Title</Label><Input
					id="title"
					name="title"
					value={String(data.hero?.title ?? '')}
					required
				/>
			</div>
			<div>
				<Label for="description">Description</Label><Textarea
					id="description"
					name="description"
					value={String(data.hero?.description ?? '')}
				/>
			</div>
			<div>
				<Label for="photo">Restaurant photo</Label><Input
					id="photo"
					name="photo"
					type="file"
					accept="image/jpeg,image/png,image/webp"
				/>
			</div>
			<div>
				<Label for="ctaLabel">Button label</Label><Input
					id="ctaLabel"
					name="ctaLabel"
					value={String(data.hero?.cta_label ?? '')}
				/>
			</div>
			<div>
				<Label for="ctaUrl">Button URL</Label><Input
					id="ctaUrl"
					name="ctaUrl"
					value={String(data.hero?.cta_url ?? '')}
				/>
			</div>
			<Button type="submit">Save hero</Button>
		</form></CardContent
	></Card
>
