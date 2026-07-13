import { fail } from '@sveltejs/kit';
import { requireCsrf } from '$lib/server/auth';
import { audit } from '$lib/server/audit';
import { decimalRate, parseCurrencyCode, rateToDecimal, syncRates } from '$lib/server/currency';
import { restaurantId } from '$lib/server/restaurant';
import { requireAdmin } from '$lib/server/permissions';
import { currencyHealth as getCurrencyHealth } from '$lib/currency-health';
import { normalizeBrandColor, projectCustomerBrand } from '$lib/branding';
import { uploadImage } from '$lib/server/media';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, platform }) => {
	requireAdmin(locals);
	const restaurant = restaurantId(platform!.env);
	const db = platform!.env.DB;
	const restaurantRow = await db.prepare('SELECT currency FROM restaurants WHERE id=?').bind(restaurant).first<{ currency: string }>();
	const brandingRow = await db.prepare('SELECT title,logo_asset_id AS logoAssetId,primary_color AS primaryColor,accent_color AS accentColor FROM site_content WHERE restaurant_id=?').bind(restaurant).first<{ title: string; logoAssetId: string | null; primaryColor: string | null; accentColor: string | null }>();
	const settings = await db.prepare('SELECT display_enabled,display_currency,rate_mode,fixed_rate_numerator,fixed_rate_denominator,updated_at FROM currency_settings WHERE restaurant_id=?')
		.bind(restaurant).first<{ display_enabled: number; display_currency: string | null; rate_mode: 'fixed' | 'api'; fixed_rate_numerator: string | null; fixed_rate_denominator: string | null; updated_at: string }>();
	let fixedRate = '';
	try { if (settings?.fixed_rate_numerator && settings.fixed_rate_denominator) fixedRate = rateToDecimal({ numerator: BigInt(settings.fixed_rate_numerator), denominator: BigInt(settings.fixed_rate_denominator) }); } catch { /* malformed legacy settings are never rendered as a quote */ }
	const currencies = (await db.prepare('SELECT currency_code,minor_unit,locale,enabled,is_base,rate_mode,fixed_numerator,fixed_denominator,updated_at FROM restaurant_currencies WHERE restaurant_id=? ORDER BY is_base DESC,currency_code').bind(restaurant).all()).results;
	const healthRows = (await db.prepare("SELECT c.currency_code,c.enabled,c.is_base,c.rate_mode,c.updated_at,c.fixed_numerator,c.fixed_denominator,s.fetched_at,s.expires_at FROM restaurant_currencies c LEFT JOIN currency_rate_sync s ON s.restaurant_id=c.restaurant_id AND s.base_currency=? AND s.quote_currency=c.currency_code WHERE c.restaurant_id=? ORDER BY c.is_base DESC,c.currency_code").bind(restaurantRow?.currency ?? 'USD', restaurant).all()).results;
	const currencyHealth = getCurrencyHealth(healthRows as Parameters<typeof getCurrencyHealth>[0]);
	const beverage = await db.prepare('SELECT enabled,heading,body,skip_label FROM beverage_prompt_settings WHERE restaurant_id=?').bind(restaurant).first();
	const menuTargets = (await db.prepare('SELECT i.id,i.name,c.name category FROM menu_items i JOIN menu_categories c ON c.id=i.category_id WHERE c.restaurant_id=? AND i.archived=0 ORDER BY c.position,i.position').bind(restaurant).all()).results;
	const categoryTargets = (await db.prepare('SELECT id,name FROM menu_categories WHERE restaurant_id=? AND archived=0 ORDER BY position').bind(restaurant).all()).results;
	const beverageItems = (await db.prepare('SELECT item_id FROM beverage_prompt_items WHERE restaurant_id=?').bind(restaurant).all<{item_id:string}>()).results.map((row)=>row.item_id);
	const beverageCategories = (await db.prepare('SELECT category_id FROM beverage_prompt_categories WHERE restaurant_id=?').bind(restaurant).all<{category_id:string}>()).results.map((row)=>row.category_id);
	return { baseCurrency: restaurantRow?.currency ?? 'USD', settings, fixedRate, currencies, currencyHealth, beverage, menuTargets, categoryTargets, beverageItems, beverageCategories, branding: { title: brandingRow?.title ?? 'Menyue', ...projectCustomerBrand(brandingRow ?? {}) } };
};

export const actions: Actions = {
	branding: async (event) => {
		requireAdmin(event.locals);
		await requireCsrf(event);
		const form = await event.request.formData();
		const primary = normalizeBrandColor(form.get('primaryColor'));
		const accent = normalizeBrandColor(form.get('accentColor'));
		if (!primary || !accent) return fail(400, { brandingMessage: 'Use a six-digit hex colour, such as #18372F.' });
		const restaurant = restaurantId(event.platform!.env);
		const logo = form.get('logo');
		let logoAssetId: string | null = null;
		try {
			if (logo instanceof File && logo.size) logoAssetId = await uploadImage(event.platform!.env.DB, event.platform!.env.MEDIA, logo, restaurant);
		} catch (cause) {
			return fail(400, { brandingMessage: cause instanceof Error ? cause.message : 'Logo upload failed.' });
		}
		await event.platform!.env.DB.prepare("INSERT INTO site_content(restaurant_id,primary_color,accent_color,logo_asset_id) VALUES(?,?,?,?) ON CONFLICT(restaurant_id) DO UPDATE SET primary_color=excluded.primary_color,accent_color=excluded.accent_color,logo_asset_id=COALESCE(excluded.logo_asset_id,site_content.logo_asset_id)")
			.bind(restaurant, primary, accent, logoAssetId).run();
		await event.platform!.env.DB.prepare('UPDATE restaurants SET menu_revision=menu_revision+1 WHERE id=?').bind(restaurant).run();
		await audit(event.platform!.env.DB, event.locals.user!.id, 'customer.branding.updated', 'restaurant', restaurant, { uploaded: logoAssetId !== null });
		return { brandingSaved: true };
	},
	save: async (event) => {
		const restaurant = restaurantId(event.platform!.env);
		requireAdmin(event.locals);
		await requireCsrf(event);
		const db = event.platform!.env.DB;
		const form = await event.request.formData();
		const base = parseCurrencyCode(form.get('baseCurrency'));
		const current = await db.prepare('SELECT currency FROM restaurants WHERE id=?').bind(restaurant).first<{ currency: string }>();
		const enabled = form.get('displayEnabled') === 'on';
		const quote = parseCurrencyCode(form.get('displayCurrency'));
		const mode = form.get('rateMode') === 'api' ? 'api' : 'fixed';
		const fixed = decimalRate(String(form.get('fixedRate') ?? ''));
		if (!current || base !== current.currency)
			return fail(400, { message: 'Change the restaurant base currency with the confirmed Make base action below.' });
		if ((enabled && (!quote || quote === current.currency)) || (enabled && !fixed))
			return fail(400, { message: 'Choose valid ISO currencies and a positive fixed fallback rate.' });
		await db.batch([
			db.prepare("INSERT INTO currency_settings(restaurant_id,display_enabled,display_currency,rate_mode,fixed_rate_numerator,fixed_rate_denominator,updated_at) VALUES(?,?,?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(restaurant_id) DO UPDATE SET display_enabled=excluded.display_enabled,display_currency=excluded.display_currency,rate_mode=excluded.rate_mode,fixed_rate_numerator=excluded.fixed_rate_numerator,fixed_rate_denominator=excluded.fixed_rate_denominator,updated_at=CURRENT_TIMESTAMP")
				.bind(restaurant, enabled ? 1 : 0, quote, mode, fixed?.numerator.toString() ?? null, fixed?.denominator.toString() ?? null),
		]);
		await audit(db, event.locals.user!.id, 'currency.settings.updated', 'restaurant', restaurant, { base: current.currency, enabled, quote, mode });
		return { saved: true };
	},
	sync: async (event) => { requireAdmin(event.locals); await requireCsrf(event); const restaurant = restaurantId(event.platform!.env); const updated = await syncRates(event.platform!.env.DB, restaurant); await audit(event.platform!.env.DB,event.locals.user!.id,'currency.rates.synced','restaurant',restaurant,{updated}); return { synced: updated }; },
	beverage: async (event) => {
		requireAdmin(event.locals); await requireCsrf(event); const db=event.platform!.env.DB, restaurant=restaurantId(event.platform!.env), form=await event.request.formData();
		const itemIds=form.getAll('itemId').map(String), categoryIds=form.getAll('categoryId').map(String);
		const goodItems=await db.prepare(`SELECT i.id FROM menu_items i JOIN menu_categories c ON c.id=i.category_id WHERE c.restaurant_id=? AND i.id IN (${itemIds.map(()=>'?').join(',') || "''"})`).bind(restaurant,...itemIds).all<{id:string}>();
		const goodCategories=await db.prepare(`SELECT id FROM menu_categories WHERE restaurant_id=? AND id IN (${categoryIds.map(()=>'?').join(',') || "''"})`).bind(restaurant,...categoryIds).all<{id:string}>();
		if (goodItems.results.length!==itemIds.length || goodCategories.results.length!==categoryIds.length) return fail(400,{message:'Invalid beverage target.'});
		await db.batch([db.prepare("INSERT INTO beverage_prompt_settings(restaurant_id,enabled,heading,body,skip_label,updated_at) VALUES(?,?,?,?,?,unixepoch()) ON CONFLICT(restaurant_id) DO UPDATE SET enabled=excluded.enabled,heading=excluded.heading,body=excluded.body,skip_label=excluded.skip_label,updated_at=unixepoch()").bind(restaurant,form.get('enabled')==='on'?1:0,String(form.get('heading')||'Something to drink?').slice(0,100),String(form.get('body')||'').slice(0,300),String(form.get('skipLabel')||'No thanks, send order').slice(0,100)),db.prepare('DELETE FROM beverage_prompt_items WHERE restaurant_id=?').bind(restaurant),db.prepare('DELETE FROM beverage_prompt_categories WHERE restaurant_id=?').bind(restaurant),...goodItems.results.map(row=>db.prepare('INSERT INTO beverage_prompt_items(restaurant_id,item_id) VALUES(?,?)').bind(restaurant,row.id)),...goodCategories.results.map(row=>db.prepare('INSERT INTO beverage_prompt_categories(restaurant_id,category_id) VALUES(?,?)').bind(restaurant,row.id))]);
		await audit(db,event.locals.user!.id,'beverage.prompt.updated','restaurant',restaurant,{enabled:form.get('enabled')==='on',itemIds,categoryIds}); return { beverageSaved:true };
	},
	currency: async (event) => {
		requireAdmin(event.locals); await requireCsrf(event); const db=event.platform!.env.DB, restaurant=restaurantId(event.platform!.env), f=await event.request.formData();
		const code=parseCurrencyCode(f.get('code')); const unit=Number(f.get('minorUnit') ?? 2); const mode=f.get('mode') === 'api' ? 'api' : 'fixed'; const rate=decimalRate(String(f.get('fixedRate') ?? ''));
		if (!code || !Number.isInteger(unit) || unit < 0 || unit > 4 || (mode === 'fixed' && !rate)) return fail(400,{message:'Enter a valid currency, 0–4 minor units, and a positive fixed rate.'});
		const base=await db.prepare('SELECT currency FROM restaurants WHERE id=?').bind(restaurant).first<{currency:string}>(); if (code === base?.currency) return fail(400,{message:'The restaurant base currency is managed below.'});
		await db.prepare("INSERT INTO restaurant_currencies(restaurant_id,currency_code,minor_unit,locale,enabled,is_base,rate_mode,fixed_numerator,fixed_denominator,updated_at) VALUES(?,?,?,?,1,0,?,?,?,unixepoch()) ON CONFLICT(restaurant_id,currency_code) DO UPDATE SET minor_unit=excluded.minor_unit,locale=excluded.locale,enabled=excluded.enabled,rate_mode=excluded.rate_mode,fixed_numerator=excluded.fixed_numerator,fixed_denominator=excluded.fixed_denominator,updated_at=unixepoch()").bind(restaurant,code,unit,String(f.get('locale') || 'en'),mode,rate?.numerator.toString() ?? null,rate?.denominator.toString() ?? null).run();
		await audit(db,event.locals.user!.id,'currency.quote.saved','currency',code,{mode,unit}); return { currencySaved:true };
	},
	removeCurrency: async (event) => {
		requireAdmin(event.locals); await requireCsrf(event); const db=event.platform!.env.DB, restaurant=restaurantId(event.platform!.env), code=parseCurrencyCode((await event.request.formData()).get('code')); if (!code) return fail(400,{message:'Invalid currency.'});
		const r=await db.prepare('DELETE FROM restaurant_currencies WHERE restaurant_id=? AND currency_code=? AND is_base=0').bind(restaurant,code).run(); if (!r.meta.changes) return fail(400,{message:'Base currency cannot be removed.'}); await db.prepare('DELETE FROM currency_rate_sync WHERE restaurant_id=? AND quote_currency=?').bind(restaurant,code).run(); await audit(db,event.locals.user!.id,'currency.quote.removed','currency',code); return { currencyRemoved:true };
	},
	makeBase: async (event) => {
		requireAdmin(event.locals); await requireCsrf(event); const db=event.platform!.env.DB, restaurant=restaurantId(event.platform!.env), f=await event.request.formData(), code=parseCurrencyCode(f.get('code'));
		if (!code || String(f.get('confirm') ?? '').trim().toUpperCase() !== code) return fail(400,{message:'Type the requested currency code to confirm the base change.'}); const row=await db.prepare('SELECT minor_unit,locale FROM restaurant_currencies WHERE restaurant_id=? AND currency_code=? AND enabled=1').bind(restaurant,code).first<{minor_unit:number;locale:string}>(); if (!row) return fail(400,{message:'Enable the target currency first.'});
		await db.batch([db.prepare('UPDATE restaurant_currencies SET is_base=0 WHERE restaurant_id=?').bind(restaurant),db.prepare('UPDATE restaurant_currencies SET is_base=1,rate_mode=\'fixed\',fixed_numerator=NULL,fixed_denominator=NULL WHERE restaurant_id=? AND currency_code=?').bind(restaurant,code),db.prepare('UPDATE restaurants SET currency=?,currency_minor_unit=?,currency_locale=?,money_revision=money_revision+1,rate_revision=rate_revision+1,menu_revision=menu_revision+1 WHERE id=?').bind(code,row.minor_unit,row.locale,restaurant),db.prepare('DELETE FROM currency_rate_sync WHERE restaurant_id=?').bind(restaurant)]); await audit(db,event.locals.user!.id,'currency.base.changed','restaurant',restaurant,{code}); return { baseChanged:true };
	},
};
