// Lightweight i18n for Parts Pro: English + Arabic with an in-app toggle and
// RTL support. The chosen language is persisted in secure storage. Text swaps
// instantly on change; flipping the layout *direction* (LTR<->RTL) needs an app
// restart (no expo-updates here), so we ask the user to relaunch when it flips.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Alert, I18nManager } from 'react-native';
import * as SecureStore from 'expo-secure-store';

export type Lang = 'en' | 'ar';

const KEY = 'pp_lang';

type Entry = { en: string; ar: string };

// Every user-facing string in one place. Keep keys stable — screens reference
// these, not literals.
const STRINGS: Record<string, Entry> = {
  // Tabs
  tab_catalog: { en: 'Catalog', ar: 'الكتالوج' },
  tab_pricelist: { en: 'Price List', ar: 'قائمة الأسعار' },
  tab_quote: { en: 'Quote', ar: 'التسعير' },
  tab_orders: { en: 'Orders', ar: 'الطلبات' },
  tab_account: { en: 'Account', ar: 'الحساب' },
  cart_title: { en: 'Cart', ar: 'السلة' },
  cart_each: { en: '{price} each', ar: '{price} للوحدة' },
  cart_remove: { en: 'Remove', ar: 'إزالة' },
  cart_empty_title: { en: 'Your cart is empty', ar: 'سلتك فارغة' },
  cart_empty_sub: { en: 'Add parts from the Catalog to start an order.', ar: 'أضف قطعًا من الكتالوج لبدء طلب.' },
  cart_total: { en: 'Total', ar: 'الإجمالي' },
  cart_disclaimer: { en: 'Final pricing is confirmed by the seller. Order is placed as pending.', ar: 'يؤكّد البائع السعر النهائي. يُسجَّل الطلب كقيد الانتظار.' },
  cart_place: { en: 'Place order', ar: 'تأكيد الطلب' },
  cart_placing: { en: 'Placing…', ar: 'جارٍ الإرسال…' },
  cart_placed_title: { en: 'Order placed', ar: 'تم تأكيد الطلب' },
  cart_placed_msg: { en: 'Your order was sent. Track it on the Orders tab.', ar: 'تم إرسال طلبك. تابعه من تبويب الطلبات.' },
  cart_place_err: { en: 'Could not place order', ar: 'تعذّر تأكيد الطلب' },
  ok: { en: 'OK', ar: 'حسنًا' },

  // Common
  retry: { en: 'Retry', ar: 'إعادة المحاولة' },
  save: { en: 'Save', ar: 'حفظ' },
  cancel: { en: 'Cancel', ar: 'إلغاء' },
  loading: { en: 'Loading…', ar: 'جارٍ التحميل…' },
  search: { en: 'Search', ar: 'بحث' },

  // Catalog
  cat_search_part: { en: 'Search part name or SKU', ar: 'ابحث باسم القطعة أو الرمز' },
  cat_search_device: { en: 'Search device model, e.g. iPhone 13', ar: 'ابحث عن موديل الجهاز، مثل iPhone 13' },
  cat_mode_part: { en: 'Part / SKU', ar: 'القطعة / الرمز' },
  cat_mode_device: { en: 'Device model', ar: 'موديل الجهاز' },
  cat_all: { en: 'All', ar: 'الكل' },
  cat_empty: { en: 'No parts found. Try a different search.', ar: 'لا توجد قطع. جرّب بحثًا آخر.' },
  cat_in_stock: { en: 'In stock', ar: 'متوفر' },
  cat_out_stock: { en: 'Out of stock', ar: 'غير متوفر' },
  cat_n_in_stock: { en: '{n} in stock', ar: '{n} متوفر' },
  cat_add: { en: '+ Add', ar: '+ إضافة' },
  cat_member: { en: 'member', ar: 'عضو' },
  cat_member_save: { en: 'member · save {pct}%', ar: 'عضو · وفّر {pct}%' },
  cat_fits: { en: 'Fits: {models}', ar: 'يناسب: {models}' },
  cat_inactive_title: { en: 'Membership inactive', ar: 'العضوية غير مفعّلة' },
  cat_inactive_body: { en: "Your Parts Pro subscription isn't active yet. Once activated you'll see the live member catalog with discounted prices.", ar: 'اشتراكك في Parts Pro غير مفعّل بعد. بعد التفعيل سترى كتالوج الأعضاء بأسعار مخفّضة.' },
  cat_view_cart: { en: 'View cart · {n} item(s)', ar: 'عرض السلة · {n} عنصر' },
  cat_offline: { en: "You're offline — showing the last saved catalog.", ar: 'أنت غير متصل — يتم عرض آخر كتالوج محفوظ.' },
  cat_added: { en: 'Added {name}', ar: 'تمت إضافة {name}' },
  cat_sku: { en: 'SKU {sku}', ar: 'الرمز {sku}' },
  cat_banner_save: { en: 'Pro members save {pct}% on every order. Upgrade →', ar: 'يوفّر أعضاء Pro نسبة {pct}% على كل طلب. ترقَّ ←' },
  cat_banner_upgrade: { en: 'Upgrade to Pro for member pricing →', ar: 'ترقَّ إلى Pro للحصول على أسعار الأعضاء ←' },
  cat_trial_ends_in: { en: 'Your trial ends in {n} day(s) — subscribe to keep member pricing →', ar: 'تنتهي تجربتك خلال {n} يوم — اشترك للحفاظ على أسعار الأعضاء ←' },
  cat_trial_ends_today: { en: 'Your trial ends today — subscribe to keep member pricing →', ar: 'تنتهي تجربتك اليوم — اشترك للحفاظ على أسعار الأعضاء ←' },
  cat_favorites: { en: 'Favorites', ar: 'المفضلة' },
  cat_fav_empty: { en: 'No favorites yet. Tap the heart on a part to save it here.', ar: 'لا توجد مفضلة بعد. اضغط على القلب لحفظ القطعة هنا.' },

  // Barcode scanner
  scan_hint: { en: 'Point the camera at a barcode', ar: 'وجّه الكاميرا نحو الباركود' },
  scan_perm: { en: 'Camera access is needed to scan barcodes.', ar: 'يلزم الوصول إلى الكاميرا لمسح الباركود.' },
  scan_grant: { en: 'Allow camera', ar: 'السماح بالكاميرا' },
  scan_close: { en: 'Close', ar: 'إغلاق' },

  // Stock alerts
  cat_notify_me: { en: 'Notify me', ar: 'أبلغني' },
  cat_notify_set: { en: "We'll notify you when it's back", ar: 'سنبلغك عند توفّره' },

  // Reorder
  ord_reorder: { en: 'Reorder', ar: 'إعادة الطلب' },
  ord_reordered: { en: 'Items added to your cart', ar: 'تمت إضافة العناصر إلى سلتك' },

  // Orders
  ord_empty: { en: 'No orders yet.', ar: 'لا توجد طلبات بعد.' },
  ord_log_in: { en: 'Log in to view your orders.', ar: 'سجّل الدخول لعرض طلباتك.' },
  ord_load_err: { en: "Couldn't load orders", ar: 'تعذّر تحميل الطلبات' },
  ord_total: { en: 'Total', ar: 'الإجمالي' },
  ord_items_n: { en: '{n} item(s)', ar: '{n} عنصر' },
  ord_order_no: { en: 'Order #{id}', ar: 'طلب رقم {id}' },
  ord_item_word: { en: 'item', ar: 'عنصر' },
  ord_empty_title: { en: 'No orders yet', ar: 'لا توجد طلبات بعد' },
  ord_empty_sub: { en: 'Orders you place through Parts Pro will show up here.', ar: 'ستظهر هنا الطلبات التي تجريها عبر Parts Pro.' },

  // Login
  lg_subtitle: { en: 'Wholesale parts pricing for repair pros', ar: 'أسعار قطع الجملة لمحترفي الإصلاح' },
  lg_email: { en: 'Email', ar: 'البريد الإلكتروني' },
  lg_password: { en: 'Password', ar: 'كلمة المرور' },
  lg_name: { en: 'Full name', ar: 'الاسم الكامل' },
  lg_phone: { en: 'Phone (optional)', ar: 'الهاتف (اختياري)' },
  lg_sign_in: { en: 'Sign in', ar: 'تسجيل الدخول' },
  lg_sign_up: { en: 'Create account', ar: 'إنشاء حساب' },
  lg_forgot: { en: 'Forgot password?', ar: 'نسيت كلمة المرور؟' },
  lg_to_signup: { en: "Don't have an account? Sign up", ar: 'ليس لديك حساب؟ سجّل' },
  lg_to_signin: { en: 'Already have an account? Sign in', ar: 'لديك حساب؟ سجّل الدخول' },
  lg_show: { en: 'Show', ar: 'إظهار' },
  lg_hide: { en: 'Hide', ar: 'إخفاء' },
  lg_sub_login: { en: 'Sign in to your member account', ar: 'سجّل الدخول إلى حساب العضوية' },
  lg_sub_register: { en: 'Create your member account', ar: 'أنشئ حساب العضوية الخاص بك' },
  lg_sub_forgot: { en: 'Reset your password', ar: 'إعادة تعيين كلمة المرور' },
  lg_sub_reset: { en: 'Enter the code we emailed you', ar: 'أدخل الرمز الذي أرسلناه إلى بريدك' },
  lg_cta_login: { en: 'Sign in', ar: 'تسجيل الدخول' },
  lg_cta_register: { en: 'Create account', ar: 'إنشاء حساب' },
  lg_cta_forgot: { en: 'Send reset code', ar: 'إرسال رمز إعادة التعيين' },
  lg_cta_reset: { en: 'Reset password', ar: 'إعادة تعيين كلمة المرور' },
  lg_ph_newpass: { en: 'New password', ar: 'كلمة مرور جديدة' },
  lg_ph_code: { en: 'Reset code', ar: 'رمز إعادة التعيين' },
  lg_no_account: { en: "Don't have an account? ", ar: 'ليس لديك حساب؟ ' },
  lg_have_account: { en: 'Already a member? ', ar: 'عضو بالفعل؟ ' },
  lg_signup_word: { en: 'Sign up', ar: 'سجّل' },
  lg_signin_word: { en: 'Sign in', ar: 'تسجيل الدخول' },
  lg_back_signin: { en: 'Back to sign in', ar: 'العودة لتسجيل الدخول' },
  lg_register_note: { en: 'New accounts are activated by us after payment. You can sign in right away and your member pricing unlocks once activated.', ar: 'يتم تفعيل الحسابات الجديدة من قِبلنا بعد الدفع. يمكنك تسجيل الدخول فورًا، وتُفتح أسعار الأعضاء بعد التفعيل.' },
  lg_generic_err: { en: 'Something went wrong. Please try again.', ar: 'حدث خطأ ما. يرجى المحاولة مرة أخرى.' },
  lg_a11y_show: { en: 'Show password', ar: 'إظهار كلمة المرور' },
  lg_a11y_hide: { en: 'Hide password', ar: 'إخفاء كلمة المرور' },

  // Price List Maker
  pl_log_in: { en: 'Log in to view the price list.', ar: 'سجّل الدخول لعرض قائمة الأسعار.' },
  pl_share: { en: 'Share', ar: 'مشاركة' },
  pl_search: { en: 'Search products', ar: 'ابحث عن المنتجات' },
  pl_cfg_summary: { en: 'Markup {m}% · Rounding {r}', ar: 'ربح {m}% · تقريب {r}' },
  pl_edit: { en: 'Edit', ar: 'تعديل' },
  pl_round_none: { en: 'None', ar: 'بدون' },
  pl_pricing_rules: { en: 'Pricing rules', ar: 'قواعد التسعير' },
  pl_markup: { en: 'Markup %', ar: 'نسبة الربح %' },
  pl_rounding: { en: 'Rounding', ar: 'التقريب' },
  pl_tap_hint: { en: 'Tap a product to set a custom price. Markup is applied to your buy price.', ar: 'اضغط على منتج لتعيين سعر مخصص. تُطبَّق نسبة الربح على سعر الشراء.' },
  pl_custom: { en: 'custom', ar: 'مخصص' },
  pl_custom_price: { en: 'Custom price', ar: 'سعر مخصص' },
  pl_use_markup: { en: 'Use markup', ar: 'استخدم نسبة الربح' },
  pl_cost: { en: 'cost {price}', ar: 'التكلفة {price}' },
  pl_empty: { en: 'No products found.', ar: 'لا توجد منتجات.' },
  pl_invalid_price: { en: 'Enter a valid price', ar: 'أدخل سعرًا صحيحًا' },
  pl_save_err: { en: "Couldn't save", ar: 'تعذّر الحفظ' },
  pl_pdf_title: { en: 'Price List', ar: 'قائمة الأسعار' },
  pl_pdf_meta: { en: 'Price list · {date} · {count} item(s)', ar: 'قائمة الأسعار · {date} · {count} عنصر' },
  pl_pdf_markup_note: { en: ' · incl. {m}% markup', ar: ' · شامل ربح {m}%' },
  pl_col_product: { en: 'Product', ar: 'المنتج' },
  pl_col_price: { en: 'Price', ar: 'السعر' },
  pl_nothing_title: { en: 'Nothing to share', ar: 'لا شيء للمشاركة' },
  pl_nothing_msg: { en: 'There are no products in this price list yet.', ar: 'لا توجد منتجات في قائمة الأسعار بعد.' },
  pl_pdf_err: { en: "Couldn't create PDF", ar: 'تعذّر إنشاء ملف PDF' },
  try_again: { en: 'Please try again.', ar: 'يرجى المحاولة مرة أخرى.' },
  error: { en: 'Error', ar: 'خطأ' },
  pl_load_err: { en: "Couldn't load the price list.", ar: 'تعذّر تحميل قائمة الأسعار.' },

  // Quote
  q_search_saved: { en: 'Search saved quotes', ar: 'ابحث في التسعيرات المحفوظة' },
  q_pick_part: { en: 'Pick a part to quote', ar: 'اختر قطعة للتسعير' },
  q_custom_btn: { en: '+ Quote a custom part', ar: '+ سعّر قطعة مخصصة' },
  q_no_match: { en: 'No matching parts.', ar: 'لا توجد قطع مطابقة.' },
  q_saved_header: { en: 'SAVED QUOTES', ar: 'التسعيرات المحفوظة' },
  q_start_hint: { en: 'Search for a part to start a quote.', ar: 'ابحث عن قطعة لبدء التسعير.' },
  q_pick_another: { en: '← Pick another part', ar: '← اختر قطعة أخرى' },
  q_ph_part_name: { en: 'Part name', ar: 'اسم القطعة' },
  q_ph_cost: { en: 'Your cost (e.g. 12.50)', ar: 'تكلفتك (مثال 12.50)' },
  q_your_cost: { en: 'Your cost', ar: 'تكلفتك' },
  q_your_cost_member: { en: 'Your cost (member)', ar: 'تكلفتك (عضو)' },
  q_markup_pct: { en: 'Markup {m}%', ar: 'الربح {m}%' },
  q_suggested: { en: 'Suggested customer price', ar: 'سعر العميل المقترح' },
  q_markup_label: { en: 'Markup: {m}%', ar: 'الربح: {m}%' },
  q_markup_saved: { en: 'Your markup is saved as the default for next time.', ar: 'يُحفَظ هامش ربحك كافتراضي للمرة القادمة.' },
  q_save_quote: { en: 'Save quote', ar: 'حفظ التسعير' },
  q_saving: { en: 'Saving…', ar: 'جارٍ الحفظ…' },
  q_share: { en: 'Share', ar: 'مشاركة' },
  q_delete: { en: 'Delete', ar: 'حذف' },
  q_custom_part: { en: 'Custom part', ar: 'قطعة مخصصة' },
  q_limit_title: { en: 'Daily quote limit reached', ar: 'تم بلوغ حد التسعيرات اليومي' },
  q_limit_msg: { en: 'Free members get {n} quotes per day. Upgrade to Pro for unlimited quotes.', ar: 'يحصل الأعضاء المجانيون على {n} تسعيرة يوميًا. ترقَّ إلى Pro لتسعير غير محدود.' },
  q_limit_few: { en: 'a few', ar: 'عدد قليل من' },
  q_not_now: { en: 'Not now', ar: 'ليس الآن' },
  q_upgrade: { en: 'Upgrade', ar: 'ترقية' },
  q_saved_title: { en: 'Saved', ar: 'تم الحفظ' },
  q_saved_msg: { en: 'Quote saved. Find it under "Saved quotes".', ar: 'تم حفظ التسعير. تجده ضمن "التسعيرات المحفوظة".' },
  q_save_err: { en: 'Could not save quote', ar: 'تعذّر حفظ التسعير' },
  q_del_title: { en: 'Delete quote', ar: 'حذف التسعير' },
  q_del_msg: { en: 'Delete the quote for {name}?', ar: 'حذف تسعير {name}؟' },
  q_del_err: { en: 'Could not delete', ar: 'تعذّر الحذف' },
  q_share_head: { en: 'Repair quote — {name}', ar: 'تسعير إصلاح — {name}' },
  q_share_cost: { en: 'Part cost: {price}', ar: 'تكلفة القطعة: {price}' },
  q_share_markup: { en: 'Markup: {m}%', ar: 'الربح: {m}%' },
  q_share_price: { en: 'Customer price: {price}', ar: 'سعر العميل: {price}' },

  // Account — appearance (theme)
  acc_appearance: { en: 'Appearance', ar: 'المظهر' },
  acc_theme_system: { en: 'System', ar: 'تلقائي' },
  acc_theme_light: { en: 'Light', ar: 'فاتح' },
  acc_theme_dark: { en: 'Dark', ar: 'داكن' },

  // Account — language
  acc_language: { en: 'Language', ar: 'اللغة' },
  acc_lang_en: { en: 'English', ar: 'الإنجليزية' },
  acc_lang_ar: { en: 'العربية', ar: 'العربية' },
  acc_restart_title: { en: 'Restart needed', ar: 'يلزم إعادة التشغيل' },
  acc_restart_msg: { en: 'Close and reopen Parts Pro to switch the layout direction.', ar: 'أغلق Parts Pro وأعد فتحه لتغيير اتجاه التنسيق.' },
  acc_plan: { en: 'PLAN', ar: 'الخطة' },
  acc_profile: { en: 'PROFILE', ar: 'الملف الشخصي' },
  acc_tier_pro: { en: 'Pro — Active', ar: 'Pro — مفعّل' },
  acc_tier_trial: { en: 'Free trial', ar: 'تجربة مجانية' },
  acc_tier_free: { en: 'Free plan', ar: 'الخطة المجانية' },
  acc_plan_monthly: { en: 'Monthly — ${price}/mo', ar: 'شهري — {price}$ /شهر' },
  acc_plan_annual: { en: 'Annual — ${price}/yr', ar: 'سنوي — {price}$ /سنة' },
  acc_renews_expires: { en: 'Renews / expires {date}', ar: 'يتجدد / ينتهي {date}' },
  acc_expires_in: { en: 'Expires in {n} day(s) — renew to keep member pricing.', ar: 'ينتهي خلال {n} يوم — جدّد للحفاظ على أسعار الأعضاء.' },
  acc_expires_today: { en: 'Expires today — renew to keep member pricing.', ar: 'ينتهي اليوم — جدّد للحفاظ على أسعار الأعضاء.' },
  acc_trial_left: { en: '{n} day(s) left of full Pro access', ar: 'باقٍ {n} يوم من وصول Pro الكامل' },
  acc_trial_last: { en: 'Last day of your trial', ar: 'آخر يوم في تجربتك' },
  acc_free_blurb: { en: 'Upgrade to Pro for member pricing, unlimited quotes, and saved settings.', ar: 'ترقَّ إلى Pro للحصول على أسعار الأعضاء وتسعير غير محدود وإعدادات محفوظة.' },
  acc_renew: { en: 'Renew / extend', ar: 'تجديد / تمديد' },
  acc_upgrade: { en: 'Upgrade to Pro', ar: 'الترقية إلى Pro' },
  acc_field_name: { en: 'Name', ar: 'الاسم' },
  acc_field_email: { en: 'Email', ar: 'البريد الإلكتروني' },
  acc_field_phone: { en: 'Phone', ar: 'الهاتف' },
  acc_field_since: { en: 'Member since', ar: 'عضو منذ' },
  acc_ph_name: { en: 'Full name', ar: 'الاسم الكامل' },
  acc_ph_phone: { en: 'Phone', ar: 'الهاتف' },
  acc_edit: { en: 'Edit', ar: 'تعديل' },
  acc_saving: { en: 'Saving…', ar: 'جارٍ الحفظ…' },
  acc_save_err: { en: 'Could not save profile', ar: 'تعذّر حفظ الملف الشخصي' },
  acc_refresh: { en: 'Refresh status', ar: 'تحديث الحالة' },
  acc_refreshing: { en: 'Refreshing…', ar: 'جارٍ التحديث…' },
  acc_logout: { en: 'Log out', ar: 'تسجيل الخروج' },
  acc_logout_confirm: { en: 'Are you sure you want to log out?', ar: 'هل أنت متأكد أنك تريد تسجيل الخروج؟' },
  // Account — renew / checkout flow
  acc_renew_title: { en: 'Renew membership', ar: 'تجديد العضوية' },
  acc_renew_manual: {
    en: 'Contact us to activate or renew your Parts Pro membership (cash or manual payment).',
    ar: 'تواصل معنا لتفعيل أو تجديد عضويتك في Parts Pro (نقدًا أو دفعًا يدويًا).',
  },
  // Account — redeem a gift / VIP code
  acc_redeem_title: { en: 'Redeem a code', ar: 'استرداد رمز' },
  acc_redeem_ph: { en: 'Enter your code', ar: 'أدخل الرمز' },
  acc_redeem_btn: { en: 'Redeem', ar: 'استرداد' },
  acc_redeem_busy: { en: 'Redeeming…', ar: 'جارٍ الاسترداد…' },
  acc_redeem_ok_title: { en: 'Code applied 🎉', ar: 'تم تطبيق الرمز 🎉' },
  acc_redeem_days: { en: '{n} VIP day(s) added.', ar: 'تمت إضافة {n} يوم VIP.' },
  acc_redeem_disc: { en: '{n}% bonus discount added.', ar: 'تمت إضافة خصم {n}% إضافي.' },
  acc_redeem_err: { en: 'Could not redeem this code', ar: 'تعذّر استرداد هذا الرمز' },

  acc_choose_plan: { en: 'Choose a plan', ar: 'اختر خطة' },
  acc_plan_monthly_opt: { en: 'Monthly (${price})', ar: 'شهري ({price}$)' },
  acc_plan_annual_opt: { en: 'Annual (${price})', ar: 'سنوي ({price}$)' },
  acc_checkout_err: { en: 'Could not start checkout', ar: 'تعذّر بدء عملية الدفع' },

  // Account — manual payment sheet (Whish / OMT / BOB + developer contact)
  acc_pay_title: { en: 'Pay & activate Pro', ar: 'ادفع وفعّل Pro' },
  acc_pay_sub: {
    en: 'Send your payment to one of the numbers below, then we activate your Pro membership.',
    ar: 'أرسل دفعتك إلى أحد الأرقام أدناه، ثم نقوم بتفعيل عضويتك Pro.',
  },
  acc_pay_call: { en: 'Call', ar: 'اتصل' },
  acc_pay_dev: { en: 'Contact developer', ar: 'تواصل مع المطوّر' },
  acc_pay_close: { en: 'Close', ar: 'إغلاق' },
  acc_pay_none: {
    en: 'No payment numbers are set up yet. Please contact the developer to subscribe.',
    ar: 'لم يتم إعداد أرقام الدفع بعد. يرجى التواصل مع المطوّر للاشتراك.',
  },
};

export function strFor(key: string, lang: Lang): string {
  const e = STRINGS[key];
  return e ? e[lang] || e.en : key;
}

interface I18nValue {
  lang: Lang;
  isAr: boolean;
  setLang: (l: Lang) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(I18nManager.isRTL ? 'ar' : 'en');

  useEffect(() => {
    SecureStore.getItemAsync(KEY)
      .then((v) => { if (v === 'en' || v === 'ar') setLangState(v); })
      .catch(() => {});
  }, []);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    SecureStore.setItemAsync(KEY, l).catch(() => {});
    const wantRTL = l === 'ar';
    if (wantRTL !== I18nManager.isRTL) {
      try {
        I18nManager.allowRTL(wantRTL);
        I18nManager.forceRTL(wantRTL);
      } catch {}
      Alert.alert(strFor('acc_restart_title', l), strFor('acc_restart_msg', l));
    }
  }, []);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => {
      let s = strFor(key, lang);
      if (vars) for (const k of Object.keys(vars)) s = s.replace(new RegExp(`\\{${k}\\}`, 'g'), String(vars[k]));
      return s;
    },
    [lang],
  );

  const value = useMemo<I18nValue>(() => ({ lang, isAr: lang === 'ar', setLang, t }), [lang, setLang, t]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within a LanguageProvider');
  return ctx;
}
