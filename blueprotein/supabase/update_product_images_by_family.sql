-- Backfills product_url for rows still on a generic placeholder, giving liquid and
-- solid products their own default photo instead of sharing one generic image.
-- Only touches rows that never got a real custom photo — products where the admin
-- already uploaded their own image are left untouched. Run once in the Supabase SQL Editor.

update public.products
set image_url = case
  when family = 'liquide' then '/produit_bouteille.png'
  when family = 'solide' then '/produit_sachet.png'
  else image_url
end
where image_url in ('/product-placeholder.jpg', '/blueprotein/product-placeholder.jpg');
