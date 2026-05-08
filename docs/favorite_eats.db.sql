BEGIN TRANSACTION;
CREATE TABLE IF NOT EXISTS "favorite_eats" (
	"field1"	TEXT,
	"field2"	TEXT
);
CREATE TABLE IF NOT EXISTS "ingredient_sizes" (
	"id"	INTEGER,
	"ingredient_id"	INTEGER NOT NULL,
	"size"	TEXT NOT NULL,
	"sort_order"	INTEGER,
	PRIMARY KEY("id" AUTOINCREMENT),
	FOREIGN KEY("ingredient_id") REFERENCES "ingredients"("ID") ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS "ingredient_store_location" (
	"ID"	INTEGER,
	"ingredient_id"	INTEGER NOT NULL,
	"store_location_id"	INTEGER NOT NULL,
	PRIMARY KEY("ID" AUTOINCREMENT),
	FOREIGN KEY("ingredient_id") REFERENCES "ingredients"("ID"),
	FOREIGN KEY("store_location_id") REFERENCES "store_locations"("ID")
);
CREATE TABLE IF NOT EXISTS "ingredient_synonyms" (
	"id"	INTEGER,
	"ingredient_id"	INTEGER NOT NULL,
	"synonym"	TEXT NOT NULL COLLATE NOCASE,
	PRIMARY KEY("id" AUTOINCREMENT),
	FOREIGN KEY("ingredient_id") REFERENCES "ingredients"("ID")
);
CREATE TABLE IF NOT EXISTS "ingredient_variant_store_location" (
	"id"	INTEGER,
	"ingredient_variant_id"	INTEGER NOT NULL,
	"store_location_id"	INTEGER NOT NULL,
	PRIMARY KEY("id" AUTOINCREMENT),
	UNIQUE("ingredient_variant_id","store_location_id"),
	FOREIGN KEY("ingredient_variant_id") REFERENCES "ingredient_variants"("id") ON DELETE CASCADE,
	FOREIGN KEY("store_location_id") REFERENCES "store_locations"("ID") ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS "ingredient_variant_tag_map" (
	"id"	INTEGER,
	"ingredient_variant_id"	INTEGER NOT NULL,
	"tag_id"	INTEGER NOT NULL,
	"sort_order"	INTEGER,
	PRIMARY KEY("id" AUTOINCREMENT),
	UNIQUE("ingredient_variant_id","tag_id"),
	FOREIGN KEY("ingredient_variant_id") REFERENCES "ingredient_variants"("id") ON DELETE CASCADE,
	FOREIGN KEY("tag_id") REFERENCES "tags"("id") ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS "ingredient_variants" (
	"id"	INTEGER,
	"ingredient_id"	INTEGER NOT NULL,
	"variant"	TEXT NOT NULL,
	"sort_order"	INTEGER,
	"home_location"	TEXT NOT NULL DEFAULT 'none',
	"is_deprecated"	INTEGER NOT NULL DEFAULT 0,
	PRIMARY KEY("id" AUTOINCREMENT),
	FOREIGN KEY("ingredient_id") REFERENCES "ingredients"("ID") ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS "ingredients" (
	"ID"	INTEGER NOT NULL,
	"name"	TEXT NOT NULL,
	"variant"	TEXT,
	"location_at_home"	TEXT,
	"hide_from_shopping_list"	INTEGER DEFAULT 0,
	"size"	TEXT,
	"parenthetical_note"	TEXT,
	"is_food"	INTEGER NOT NULL DEFAULT 1,
	"is_deprecated"	INTEGER NOT NULL DEFAULT 0,
	"lemma"	TEXT,
	"singular_if_unspecified"	INTEGER NOT NULL DEFAULT 0,
	"is_mass_noun"	INTEGER NOT NULL DEFAULT 0,
	"plural_override"	TEXT,
	"is_hidden"	INTEGER NOT NULL DEFAULT 0,
	PRIMARY KEY("ID" AUTOINCREMENT)
);
CREATE TABLE IF NOT EXISTS "recipe_ingredient_headings" (
	"ID"	INTEGER,
	"recipe_id"	INTEGER NOT NULL,
	"section_id"	INTEGER,
	"sort_order"	INTEGER,
	"text"	TEXT,
	PRIMARY KEY("ID")
);
CREATE TABLE IF NOT EXISTS "recipe_ingredient_map" (
	"ID"	INTEGER,
	"recipe_id"	INTEGER NOT NULL,
	"ingredient_id"	INTEGER,
	"section_id"	INTEGER,
	"quantity"	TEXT,
	"unit"	TEXT,
	"prep_notes"	TEXT,
	"is_optional"	INTEGER DEFAULT 0,
	"subrecipe_id"	INTEGER,
	"sort_order"	INTEGER,
	"parenthetical_note"	TEXT,
	"quantity_min"	REAL,
	"quantity_max"	REAL,
	"quantity_is_approx"	INTEGER NOT NULL DEFAULT 0,
	"linked_recipe_id"	INTEGER,
	"recipe_text"	TEXT,
	"is_recipe"	INTEGER NOT NULL DEFAULT 0,
	"is_alt"	INTEGER NOT NULL DEFAULT 0,
	"display_name"	TEXT,
	"variant"	TEXT,
	"size"	TEXT,
	PRIMARY KEY("ID" AUTOINCREMENT),
	FOREIGN KEY("ingredient_id") REFERENCES "ingredients"("ID"),
	FOREIGN KEY("recipe_id") REFERENCES "recipes"("ID"),
	FOREIGN KEY("section_id") REFERENCES "recipe_sections"("ID"),
	FOREIGN KEY("subrecipe_id") REFERENCES "recipes"("ID")
);
CREATE TABLE IF NOT EXISTS "recipe_ingredient_substitutes" (
	"id"	INTEGER,
	"recipe_ingredient_id"	INTEGER NOT NULL,
	"quantity"	TEXT,
	"unit"	TEXT,
	"ingredient_id"	INTEGER NOT NULL,
	"variant"	TEXT,
	"size"	TEXT,
	"prep_notes"	TEXT,
	PRIMARY KEY("id" AUTOINCREMENT),
	FOREIGN KEY("ingredient_id") REFERENCES "ingredients"("id"),
	FOREIGN KEY("recipe_ingredient_id") REFERENCES "recipe_ingredient_map"("id") ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS "recipe_sections" (
	"ID"	INTEGER,
	"recipe_id"	INTEGER NOT NULL,
	"name"	TEXT NOT NULL,
	"sort_order"	INTEGER NOT NULL,
	PRIMARY KEY("ID" AUTOINCREMENT),
	FOREIGN KEY("recipe_id") REFERENCES "recipes"("ID")
);
CREATE TABLE IF NOT EXISTS "recipe_steps" (
	"ID"	INT,
	"recipe_id"	INT,
	"step_number"	INT,
	"instructions"	TEXT,
	"type"	TEXT
);
CREATE TABLE IF NOT EXISTS "recipe_tag_map" (
	"id"	INTEGER,
	"recipe_id"	INTEGER NOT NULL,
	"tag_id"	INTEGER NOT NULL,
	"sort_order"	INTEGER,
	PRIMARY KEY("id" AUTOINCREMENT),
	UNIQUE("recipe_id","tag_id"),
	FOREIGN KEY("recipe_id") REFERENCES "recipes"("ID") ON DELETE CASCADE,
	FOREIGN KEY("tag_id") REFERENCES "tags"("id") ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS "recipes" (
	"ID"	INTEGER,
	"title"	TEXT NOT NULL,
	"servings_default"	INTEGER,
	"servings_min"	INTEGER,
	"servings_max"	INTEGER,
	PRIMARY KEY("ID" AUTOINCREMENT)
);
CREATE TABLE IF NOT EXISTS "size_classes" (
	"code"	TEXT,
	"sort_order"	INTEGER NOT NULL,
	PRIMARY KEY("code")
);
CREATE TABLE IF NOT EXISTS "sizes" (
	"id"	INTEGER,
	"name"	TEXT NOT NULL COLLATE NOCASE,
	"is_hidden"	INTEGER NOT NULL DEFAULT 0,
	"sort_order"	INTEGER,
	"is_removed"	INTEGER NOT NULL DEFAULT 0,
	PRIMARY KEY("id" AUTOINCREMENT)
);
CREATE TABLE IF NOT EXISTS "store_locations" (
	"ID"	INTEGER,
	"store_id"	INTEGER NOT NULL,
	"name"	TEXT NOT NULL,
	"aisle_number"	INTEGER,
	"sort_order"	INTEGER,
	PRIMARY KEY("ID" AUTOINCREMENT),
	FOREIGN KEY("store_id") REFERENCES "stores"("ID")
);
CREATE TABLE IF NOT EXISTS "stores" (
	"ID"	INTEGER,
	"chain_name"	TEXT NOT NULL,
	"location_name"	TEXT NOT NULL,
	PRIMARY KEY("ID" AUTOINCREMENT)
);
CREATE TABLE IF NOT EXISTS "tags" (
	"id"	INTEGER,
	"name"	TEXT NOT NULL COLLATE NOCASE,
	"is_hidden"	INTEGER NOT NULL DEFAULT 0,
	"sort_order"	INTEGER,
	"intended_use"	TEXT NOT NULL DEFAULT 'recipes',
	PRIMARY KEY("id" AUTOINCREMENT)
);
CREATE TABLE IF NOT EXISTS "unit_suggestions" (
	"code"	TEXT,
	"use_count"	INTEGER NOT NULL DEFAULT 0,
	"last_used_at"	INTEGER,
	"is_hidden"	INTEGER NOT NULL DEFAULT 0,
	PRIMARY KEY("code")
);
CREATE TABLE IF NOT EXISTS "units" (
	"code"	TEXT,
	"name_singular"	TEXT NOT NULL,
	"name_plural"	TEXT NOT NULL,
	"category"	TEXT NOT NULL,
	"sort_order"	INTEGER,
	"is_hidden"	INTEGER NOT NULL DEFAULT 0,
	"is_removed"	INTEGER NOT NULL DEFAULT 0,
	PRIMARY KEY("code")
);
INSERT INTO "favorite_eats" VALUES ('BEGIN TRANSACTION;',NULL);
INSERT INTO "favorite_eats" VALUES ('CREATE TABLE IF NOT EXISTS ingredient_store_location (',NULL);
INSERT INTO "favorite_eats" VALUES ('ID	INTEGER',NULL);
INSERT INTO "favorite_eats" VALUES ('ingredient_id	INTEGER NOT NULL',NULL);
INSERT INTO "favorite_eats" VALUES ('store_location_id	INTEGER NOT NULL',NULL);
INSERT INTO "favorite_eats" VALUES ('PRIMARY KEY(ID AUTOINCREMENT)',NULL);
INSERT INTO "favorite_eats" VALUES ('FOREIGN KEY(ingredient_id) REFERENCES ingredients(ID)',NULL);
INSERT INTO "favorite_eats" VALUES ('FOREIGN KEY(store_location_id) REFERENCES store_locations(ID)',NULL);
INSERT INTO "favorite_eats" VALUES (');',NULL);
INSERT INTO "favorite_eats" VALUES ('CREATE TABLE IF NOT EXISTS ingredients (',NULL);
INSERT INTO "favorite_eats" VALUES ('ID	INTEGER NOT NULL',NULL);
INSERT INTO "favorite_eats" VALUES ('name	TEXT NOT NULL',NULL);
INSERT INTO "favorite_eats" VALUES ('variant	TEXT',NULL);
INSERT INTO "favorite_eats" VALUES ('location_at_home	TEXT',NULL);
INSERT INTO "favorite_eats" VALUES ('hide_from_shopping_list	INTEGER DEFAULT 0',NULL);
INSERT INTO "favorite_eats" VALUES ('size	TEXT',NULL);
INSERT INTO "favorite_eats" VALUES ('PRIMARY KEY(ID AUTOINCREMENT)',NULL);
INSERT INTO "favorite_eats" VALUES (');',NULL);
INSERT INTO "favorite_eats" VALUES ('CREATE TABLE IF NOT EXISTS recipe_ingredient_map (',NULL);
INSERT INTO "favorite_eats" VALUES ('ID	INTEGER',NULL);
INSERT INTO "favorite_eats" VALUES ('recipe_id	INTEGER NOT NULL',NULL);
INSERT INTO "favorite_eats" VALUES ('ingredient_id	INTEGER NOT NULL',NULL);
INSERT INTO "favorite_eats" VALUES ('section_id	INTEGER',NULL);
INSERT INTO "favorite_eats" VALUES ('quantity	TEXT',NULL);
INSERT INTO "favorite_eats" VALUES ('unit	TEXT',NULL);
INSERT INTO "favorite_eats" VALUES ('prep_notes	TEXT',NULL);
INSERT INTO "favorite_eats" VALUES ('is_optional	INTEGER DEFAULT 0',NULL);
INSERT INTO "favorite_eats" VALUES ('subrecipe_id	INTEGER',NULL);
INSERT INTO "favorite_eats" VALUES ('PRIMARY KEY(ID AUTOINCREMENT)',NULL);
INSERT INTO "favorite_eats" VALUES ('FOREIGN KEY(ingredient_id) REFERENCES ingredients(ID)',NULL);
INSERT INTO "favorite_eats" VALUES ('FOREIGN KEY(recipe_id) REFERENCES recipes(ID)',NULL);
INSERT INTO "favorite_eats" VALUES ('FOREIGN KEY(section_id) REFERENCES recipe_sections(ID)',NULL);
INSERT INTO "favorite_eats" VALUES ('FOREIGN KEY(subrecipe_id) REFERENCES recipes(ID)',NULL);
INSERT INTO "favorite_eats" VALUES (');',NULL);
INSERT INTO "favorite_eats" VALUES ('CREATE TABLE IF NOT EXISTS recipe_sections (',NULL);
INSERT INTO "favorite_eats" VALUES ('ID	INTEGER',NULL);
INSERT INTO "favorite_eats" VALUES ('recipe_id	INTEGER NOT NULL',NULL);
INSERT INTO "favorite_eats" VALUES ('name	TEXT NOT NULL',NULL);
INSERT INTO "favorite_eats" VALUES ('sort_order	INTEGER NOT NULL',NULL);
INSERT INTO "favorite_eats" VALUES ('PRIMARY KEY(ID AUTOINCREMENT)',NULL);
INSERT INTO "favorite_eats" VALUES ('FOREIGN KEY(recipe_id) REFERENCES recipes(ID)',NULL);
INSERT INTO "favorite_eats" VALUES (');',NULL);
INSERT INTO "favorite_eats" VALUES ('CREATE TABLE IF NOT EXISTS recipe_steps (',NULL);
INSERT INTO "favorite_eats" VALUES ('ID	INTEGER',NULL);
INSERT INTO "favorite_eats" VALUES ('recipe_id	INTEGER NOT NULL',NULL);
INSERT INTO "favorite_eats" VALUES ('section_id	INTEGER',NULL);
INSERT INTO "favorite_eats" VALUES ('step_number	INTEGER NOT NULL',NULL);
INSERT INTO "favorite_eats" VALUES ('instructions	TEXT NOT NULL',NULL);
INSERT INTO "favorite_eats" VALUES ('PRIMARY KEY(ID)',NULL);
INSERT INTO "favorite_eats" VALUES ('FOREIGN KEY(recipe_id) REFERENCES recipes(ID)',NULL);
INSERT INTO "favorite_eats" VALUES ('FOREIGN KEY(section_id) REFERENCES recipe_sections(ID)',NULL);
INSERT INTO "favorite_eats" VALUES (');',NULL);
INSERT INTO "favorite_eats" VALUES ('CREATE TABLE IF NOT EXISTS recipes (',NULL);
INSERT INTO "favorite_eats" VALUES ('ID	INTEGER',NULL);
INSERT INTO "favorite_eats" VALUES ('title	TEXT NOT NULL',NULL);
INSERT INTO "favorite_eats" VALUES ('servings_default	INTEGER',NULL);
INSERT INTO "favorite_eats" VALUES ('servings_min	INTEGER',NULL);
INSERT INTO "favorite_eats" VALUES ('servings_max	INTEGER',NULL);
INSERT INTO "favorite_eats" VALUES ('PRIMARY KEY(ID AUTOINCREMENT)',NULL);
INSERT INTO "favorite_eats" VALUES (');',NULL);
INSERT INTO "favorite_eats" VALUES ('CREATE TABLE IF NOT EXISTS store_locations (',NULL);
INSERT INTO "favorite_eats" VALUES ('ID	INTEGER',NULL);
INSERT INTO "favorite_eats" VALUES ('store_id	INTEGER NOT NULL',NULL);
INSERT INTO "favorite_eats" VALUES ('name	TEXT NOT NULL',NULL);
INSERT INTO "favorite_eats" VALUES ('aisle_number	INTEGER',NULL);
INSERT INTO "favorite_eats" VALUES ('sort_order	INTEGER',NULL);
INSERT INTO "favorite_eats" VALUES ('PRIMARY KEY(ID AUTOINCREMENT)',NULL);
INSERT INTO "favorite_eats" VALUES ('FOREIGN KEY(store_id) REFERENCES stores(ID)',NULL);
INSERT INTO "favorite_eats" VALUES (');',NULL);
INSERT INTO "favorite_eats" VALUES ('CREATE TABLE IF NOT EXISTS stores (',NULL);
INSERT INTO "favorite_eats" VALUES ('ID	INTEGER',NULL);
INSERT INTO "favorite_eats" VALUES ('chain_name	TEXT NOT NULL',NULL);
INSERT INTO "favorite_eats" VALUES ('location_name	TEXT NOT NULL',NULL);
INSERT INTO "favorite_eats" VALUES ('PRIMARY KEY(ID AUTOINCREMENT)',NULL);
INSERT INTO "favorite_eats" VALUES (');',NULL);
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredient_store_location VALUES (1','10');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredient_store_location VALUES (2','11');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredient_store_location VALUES (3','12');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredient_store_location VALUES (4','13');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredient_store_location VALUES (5','14');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredient_store_location VALUES (6','15');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredient_store_location VALUES (7','16');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredient_store_location VALUES (8','17');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredient_store_location VALUES (9','18');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredient_store_location VALUES (10','19');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredient_store_location VALUES (11','20');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredient_store_location VALUES (12','21');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredient_store_location VALUES (13','22');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredient_store_location VALUES (14','23');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredient_store_location VALUES (15','24');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredient_store_location VALUES (16','25');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredient_store_location VALUES (17','26');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredient_store_location VALUES (18','27');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredient_store_location VALUES (19','28');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredient_store_location VALUES (20','29');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredient_store_location VALUES (21','30');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredient_store_location VALUES (22','31');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredient_store_location VALUES (23','32');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredient_store_location VALUES (24','33');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredient_store_location VALUES (25','34');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredient_store_location VALUES (26','35');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredient_store_location VALUES (27','36');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredient_store_location VALUES (55','64');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredient_store_location VALUES (56','65');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredient_store_location VALUES (57','66');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredient_store_location VALUES (58','67');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredient_store_location VALUES (59','68');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredient_store_location VALUES (60','69');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredient_store_location VALUES (61','70');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredient_store_location VALUES (62','71');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredient_store_location VALUES (63','72');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredient_store_location VALUES (64','73');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredient_store_location VALUES (65','74');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredient_store_location VALUES (66','75');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredient_store_location VALUES (67','76');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredient_store_location VALUES (68','77');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredient_store_location VALUES (69','78');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredient_store_location VALUES (70','79');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredient_store_location VALUES (71','80');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredient_store_location VALUES (72','81');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredient_store_location VALUES (73','82');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredient_store_location VALUES (74','83');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredient_store_location VALUES (75','84');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredient_store_location VALUES (76','85');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredient_store_location VALUES (77','86');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredient_store_location VALUES (78','87');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredient_store_location VALUES (79','88');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredient_store_location VALUES (80','89');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredient_store_location VALUES (81','90');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredient_store_location VALUES (82','91');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredient_store_location VALUES (83','92');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredient_store_location VALUES (84','93');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredient_store_location VALUES (85','94');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredient_store_location VALUES (86','95');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredient_store_location VALUES (87','96');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredient_store_location VALUES (88','97');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredient_store_location VALUES (89','98');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredient_store_location VALUES (90','99');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredient_store_location VALUES (91','100');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredient_store_location VALUES (92','101');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredient_store_location VALUES (93','102');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredient_store_location VALUES (94','103');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredient_store_location VALUES (95','104');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredient_store_location VALUES (96','105');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredient_store_location VALUES (97','106');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredient_store_location VALUES (98','107');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredient_store_location VALUES (99','108');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredient_store_location VALUES (100','109');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredient_store_location VALUES (101','110');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredient_store_location VALUES (102','111');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredient_store_location VALUES (103','5');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredient_store_location VALUES (104','112');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredient_store_location VALUES (105','113');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredient_store_location VALUES (106','114');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredient_store_location VALUES (108','2');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredient_store_location VALUES (109','116');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredient_store_location VALUES (110','117');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredient_store_location VALUES (111','118');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredient_store_location VALUES (112','119');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredient_store_location VALUES (113','120');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredient_store_location VALUES (114','121');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredient_store_location VALUES (115','122');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredient_store_location VALUES (116','123');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredient_store_location VALUES (117','124');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredient_store_location VALUES (118','125');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredient_store_location VALUES (119','126');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredient_store_location VALUES (120','127');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredient_store_location VALUES (121','128');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredient_store_location VALUES (122','129');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredient_store_location VALUES (123','130');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredient_store_location VALUES (124','131');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredient_store_location VALUES (125','132');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredient_store_location VALUES (126','133');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredients VALUES (2','''flour''');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredients VALUES (3','''sugar''');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredients VALUES (4','''baking powder''');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredients VALUES (5','''salt''');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredients VALUES (6','''oat milk''');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredients VALUES (7','''vinegar''');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredients VALUES (8','''oil''');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredients VALUES (9','''water''');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredients VALUES (10','''dates''');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredients VALUES (11','''grapes''');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredients VALUES (12','''berries''');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredients VALUES (13','''kiwi''');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredients VALUES (14','''melon''');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredients VALUES (15','''grapefruit''');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredients VALUES (16','''clementine''');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredients VALUES (17','''pears''');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredients VALUES (18','''nectarines''');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredients VALUES (19','''lemons''');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredients VALUES (20','''celery''');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredients VALUES (21','''scallions''');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredients VALUES (22','''cabbage''');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredients VALUES (23','''carrots''');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredients VALUES (24','''broccoli''');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredients VALUES (25','''cauliflower''');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredients VALUES (26','''cucumber''');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredients VALUES (27','''apples''');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredients VALUES (28','''bananas''');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredients VALUES (29','''tomato''');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredients VALUES (30','''avocado''');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredients VALUES (31','''potato''');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredients VALUES (32','''onion''');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredients VALUES (33','''garlic''');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredients VALUES (34','''mushrooms''');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredients VALUES (35','''lettuce''');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredients VALUES (36','''spinach''');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredients VALUES (64','''soap''');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredients VALUES (65','''toothpaste''');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredients VALUES (66','''epsom salt''');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredients VALUES (67','''shampoo''');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredients VALUES (68','''deodorant''');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredients VALUES (69','''blueberries''');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredients VALUES (70','''cherries''');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredients VALUES (71','''strawberries''');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredients VALUES (72','''corn''');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredients VALUES (73','''peas''');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredients VALUES (74','''edamame''');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredients VALUES (75','''fries''');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredients VALUES (76','''just folded eggs''');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredients VALUES (77','''beyond beef patties''');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredients VALUES (78','''chickn’ tenders''');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredients VALUES (79','''ice cream''');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredients VALUES (80','''sponges''');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredients VALUES (81','''trash bags''');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredients VALUES (82','''compost bags''');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredients VALUES (83','''dish soap''');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredients VALUES (84','''all purpose cleaner''');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredients VALUES (85','''parchment''');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredients VALUES (86','''aluminum foil''');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredients VALUES (87','''waxed paper''');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredients VALUES (88','''paper towels''');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredients VALUES (89','''toilet paper''');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredients VALUES (90','''cat litter''');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredients VALUES (91','''tea''');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredients VALUES (92','''pasta''');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredients VALUES (93','''marinara sauce''');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredients VALUES (94','''olive oil''');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredients VALUES (95','''ponzu''');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredients VALUES (96','''beans''');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredients VALUES (97','''rice''');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredients VALUES (98','''veg broth''');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredients VALUES (99','''bread''');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredients VALUES (100','''bagels''');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredients VALUES (101','''buns''');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredients VALUES (102','''chips''');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredients VALUES (103','''crackers''');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredients VALUES (104','''seaweed''');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredients VALUES (105','''cookies''');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredients VALUES (106','''walnuts''');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredients VALUES (107','''pepitas''');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredients VALUES (108','''goji berries''');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredients VALUES (109','''just egg''');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredients VALUES (110','''hummus''');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredients VALUES (111','''salsa''');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredients VALUES (112','''oatmeal''');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredients VALUES (113','''granola''');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredients VALUES (114','''nutritional yeast''');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredients VALUES (116','''flour''');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredients VALUES (117','''date syrup''');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredients VALUES (118','''syrup''');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredients VALUES (119','''honey''');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredients VALUES (120','''jam''');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredients VALUES (121','''nocciolata''');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredients VALUES (122','''almond butter''');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredients VALUES (123','''pistachio butter''');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredients VALUES (124','''coffee''');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredients VALUES (125','''yogurt''');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredients VALUES (126','''oatmilk''');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredients VALUES (127','''earth balance''');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredients VALUES (128','''butter''');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredients VALUES (129','''coconut water''');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredients VALUES (130','''tofu''');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredients VALUES (131','''ramen''');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredients VALUES (132','''veganaise''');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredients VALUES (133','''breakfast links''');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredients VALUES (134','''black pepper''');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredients VALUES (135','''chuck''');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredients VALUES (136','''chuck''');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredients VALUES (137','''cashews''');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredients VALUES (138','''garlic powder''');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredients VALUES (139','''basil''');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredients VALUES (140','''oregano''');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredients VALUES (141','''lasagna noodles''');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredients VALUES (142','''parmesan''');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredients VALUES (143','''basil''');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO ingredients VALUES (147','''pine nuts''');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO recipe_ingredient_map VALUES (1','2');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO recipe_ingredient_map VALUES (2','2');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO recipe_ingredient_map VALUES (3','2');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO recipe_ingredient_map VALUES (4','2');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO recipe_ingredient_map VALUES (5','2');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO recipe_ingredient_map VALUES (6','2');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO recipe_ingredient_map VALUES (7','2');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO recipe_ingredient_map VALUES (8','2');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO recipe_ingredient_map VALUES (9','2');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO recipe_ingredient_map VALUES (10','2');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO recipe_ingredient_map VALUES (11','2');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO recipe_ingredient_map VALUES (12','2');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO recipe_ingredient_map VALUES (13','2');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO recipe_ingredient_map VALUES (14','2');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO recipe_ingredient_map VALUES (15','2');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO recipe_ingredient_map VALUES (16','2');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO recipe_ingredient_map VALUES (17','2');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO recipe_ingredient_map VALUES (18','2');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO recipe_ingredient_map VALUES (19','2');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO recipe_ingredient_map VALUES (20','2');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO recipe_ingredient_map VALUES (21','2');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO recipe_ingredient_map VALUES (22','2');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO recipe_ingredient_map VALUES (23','2');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO recipe_ingredient_map VALUES (24','3');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO recipe_ingredient_map VALUES (25','3');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO recipe_ingredient_map VALUES (27','3');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO recipe_ingredient_map VALUES (28','3');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO recipe_ingredient_map VALUES (29','2');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO recipe_ingredient_map VALUES (30','2');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO recipe_sections VALUES (1','2');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO recipe_sections VALUES (2','2');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO recipe_sections VALUES (3','2');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO recipe_sections VALUES (7','3');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO recipe_steps VALUES (1','1');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO recipe_steps VALUES (2','1');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO recipe_steps VALUES (3','1');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO recipe_steps VALUES (4','1');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO recipe_steps VALUES (5','1');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO recipe_steps VALUES (6','2');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO recipe_steps VALUES (7','2');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO recipe_steps VALUES (8','2');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO recipe_steps VALUES (9','2');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO recipe_steps VALUES (10','2');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO recipe_steps VALUES (11','2');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO recipe_steps VALUES (12','2');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO recipe_steps VALUES (13','2');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO recipe_steps VALUES (14','2');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO recipe_steps VALUES (15','2');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO recipe_steps VALUES (16','2');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO recipe_steps VALUES (17','2');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO recipe_steps VALUES (18','2');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO recipe_steps VALUES (19','2');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO recipe_steps VALUES (20','2');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO recipe_steps VALUES (21','3');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO recipe_steps VALUES (22','3');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO recipe_steps VALUES (23','3');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO recipe_steps VALUES (24','3');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO recipes VALUES (1','''pancakes''');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO recipes VALUES (2','''lasagna''');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO recipes VALUES (3','''vegan parmesan''');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO store_locations VALUES (1','1');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO store_locations VALUES (2','1');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO store_locations VALUES (3','1');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO store_locations VALUES (4','1');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO store_locations VALUES (5','1');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO store_locations VALUES (6','1');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO store_locations VALUES (7','1');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO store_locations VALUES (8','1');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO store_locations VALUES (9','1');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO store_locations VALUES (10','1');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO store_locations VALUES (11','1');
INSERT INTO "favorite_eats" VALUES ('INSERT INTO stores VALUES (1','''whole foods''');
INSERT INTO "favorite_eats" VALUES ('COMMIT;',NULL);
INSERT INTO "ingredient_sizes" VALUES (4,32,'medium',2);
INSERT INTO "ingredient_sizes" VALUES (5,32,'large',3);
INSERT INTO "ingredient_sizes" VALUES (7,171,'large',1);
INSERT INTO "ingredient_sizes" VALUES (14,172,'large',1);
INSERT INTO "ingredient_sizes" VALUES (15,179,'extra value meal',1);
INSERT INTO "ingredient_sizes" VALUES (18,32,'medium-to-large',4);
INSERT INTO "ingredient_sizes" VALUES (20,31,'medium',0);
INSERT INTO "ingredient_sizes" VALUES (21,23,'large',1);
INSERT INTO "ingredient_sizes" VALUES (22,110,'large',1);
INSERT INTO "ingredient_sizes" VALUES (23,7,'smurf',1);
INSERT INTO "ingredient_sizes" VALUES (24,7,'extra value meal',2);
INSERT INTO "ingredient_sizes" VALUES (25,7,'double-double',3);
INSERT INTO "ingredient_store_location" VALUES (19791,27,1);
INSERT INTO "ingredient_store_location" VALUES (19792,353,1);
INSERT INTO "ingredient_store_location" VALUES (19793,347,1);
INSERT INTO "ingredient_store_location" VALUES (19794,30,1);
INSERT INTO "ingredient_store_location" VALUES (19795,28,1);
INSERT INTO "ingredient_store_location" VALUES (19796,370,1);
INSERT INTO "ingredient_store_location" VALUES (19797,296,1);
INSERT INTO "ingredient_store_location" VALUES (19798,69,1);
INSERT INTO "ingredient_store_location" VALUES (19799,373,1);
INSERT INTO "ingredient_store_location" VALUES (19800,24,1);
INSERT INTO "ingredient_store_location" VALUES (19801,22,1);
INSERT INTO "ingredient_store_location" VALUES (19802,23,1);
INSERT INTO "ingredient_store_location" VALUES (19803,25,1);
INSERT INTO "ingredient_store_location" VALUES (19804,20,1);
INSERT INTO "ingredient_store_location" VALUES (19805,282,1);
INSERT INTO "ingredient_store_location" VALUES (19806,16,1);
INSERT INTO "ingredient_store_location" VALUES (19807,26,1);
INSERT INTO "ingredient_store_location" VALUES (19808,297,1);
INSERT INTO "ingredient_store_location" VALUES (19809,336,1);
INSERT INTO "ingredient_store_location" VALUES (19810,33,1);
INSERT INTO "ingredient_store_location" VALUES (19811,294,1);
INSERT INTO "ingredient_store_location" VALUES (19812,15,1);
INSERT INTO "ingredient_store_location" VALUES (19813,298,1);
INSERT INTO "ingredient_store_location" VALUES (19814,285,1);
INSERT INTO "ingredient_store_location" VALUES (19815,13,1);
INSERT INTO "ingredient_store_location" VALUES (19816,252,1);
INSERT INTO "ingredient_store_location" VALUES (19817,35,1);
INSERT INTO "ingredient_store_location" VALUES (19818,286,1);
INSERT INTO "ingredient_store_location" VALUES (19819,14,1);
INSERT INTO "ingredient_store_location" VALUES (19820,34,1);
INSERT INTO "ingredient_store_location" VALUES (19821,18,1);
INSERT INTO "ingredient_store_location" VALUES (19822,32,1);
INSERT INTO "ingredient_store_location" VALUES (19823,258,1);
INSERT INTO "ingredient_store_location" VALUES (19824,17,1);
INSERT INTO "ingredient_store_location" VALUES (19825,31,1);
INSERT INTO "ingredient_store_location" VALUES (19826,210,1);
INSERT INTO "ingredient_store_location" VALUES (19827,289,1);
INSERT INTO "ingredient_store_location" VALUES (19828,21,1);
INSERT INTO "ingredient_store_location" VALUES (19829,36,1);
INSERT INTO "ingredient_store_location" VALUES (19830,71,1);
INSERT INTO "ingredient_store_location" VALUES (19831,348,1);
INSERT INTO "ingredient_store_location" VALUES (19832,29,1);
INSERT INTO "ingredient_store_location" VALUES (19833,278,1);
INSERT INTO "ingredient_store_location" VALUES (19834,287,37);
INSERT INTO "ingredient_store_location" VALUES (19835,68,2);
INSERT INTO "ingredient_store_location" VALUES (19836,66,2);
INSERT INTO "ingredient_store_location" VALUES (19837,67,2);
INSERT INTO "ingredient_store_location" VALUES (19838,64,2);
INSERT INTO "ingredient_store_location" VALUES (19839,65,2);
INSERT INTO "ingredient_store_location" VALUES (19840,69,3);
INSERT INTO "ingredient_store_location" VALUES (19841,70,3);
INSERT INTO "ingredient_store_location" VALUES (19842,364,3);
INSERT INTO "ingredient_store_location" VALUES (19843,78,3);
INSERT INTO "ingredient_store_location" VALUES (19844,72,3);
INSERT INTO "ingredient_store_location" VALUES (19845,74,3);
INSERT INTO "ingredient_store_location" VALUES (19846,75,3);
INSERT INTO "ingredient_store_location" VALUES (19847,79,3);
INSERT INTO "ingredient_store_location" VALUES (19848,109,3);
INSERT INTO "ingredient_store_location" VALUES (19849,299,3);
INSERT INTO "ingredient_store_location" VALUES (19850,73,3);
INSERT INTO "ingredient_store_location" VALUES (19851,300,3);
INSERT INTO "ingredient_store_location" VALUES (19852,280,3);
INSERT INTO "ingredient_store_location" VALUES (19853,71,3);
INSERT INTO "ingredient_store_location" VALUES (19854,318,3);
INSERT INTO "ingredient_store_location" VALUES (19855,379,3);
INSERT INTO "ingredient_store_location" VALUES (19856,86,4);
INSERT INTO "ingredient_store_location" VALUES (19857,90,4);
INSERT INTO "ingredient_store_location" VALUES (19858,301,4);
INSERT INTO "ingredient_store_location" VALUES (19859,82,4);
INSERT INTO "ingredient_store_location" VALUES (19860,83,4);
INSERT INTO "ingredient_store_location" VALUES (19861,88,4);
INSERT INTO "ingredient_store_location" VALUES (19862,85,4);
INSERT INTO "ingredient_store_location" VALUES (19863,80,4);
INSERT INTO "ingredient_store_location" VALUES (19864,91,4);
INSERT INTO "ingredient_store_location" VALUES (19865,89,4);
INSERT INTO "ingredient_store_location" VALUES (19866,81,4);
INSERT INTO "ingredient_store_location" VALUES (19867,87,4);
INSERT INTO "ingredient_store_location" VALUES (19868,96,5);
INSERT INTO "ingredient_store_location" VALUES (19869,160,5);
INSERT INTO "ingredient_store_location" VALUES (19870,335,5);
INSERT INTO "ingredient_store_location" VALUES (19871,317,5);
INSERT INTO "ingredient_store_location" VALUES (19872,292,5);
INSERT INTO "ingredient_store_location" VALUES (19873,331,5);
INSERT INTO "ingredient_store_location" VALUES (19874,93,5);
INSERT INTO "ingredient_store_location" VALUES (19875,259,5);
INSERT INTO "ingredient_store_location" VALUES (19876,8,5);
INSERT INTO "ingredient_store_location" VALUES (19877,94,5);
INSERT INTO "ingredient_store_location" VALUES (19878,92,5);
INSERT INTO "ingredient_store_location" VALUES (19879,349,5);
INSERT INTO "ingredient_store_location" VALUES (19880,97,5);
INSERT INTO "ingredient_store_location" VALUES (19881,293,5);
INSERT INTO "ingredient_store_location" VALUES (19882,279,5);
INSERT INTO "ingredient_store_location" VALUES (19883,375,5);
INSERT INTO "ingredient_store_location" VALUES (19884,167,5);
INSERT INTO "ingredient_store_location" VALUES (19885,7,5);
INSERT INTO "ingredient_store_location" VALUES (19886,295,5);
INSERT INTO "ingredient_store_location" VALUES (19887,260,5);
INSERT INTO "ingredient_store_location" VALUES (19888,137,7);
INSERT INTO "ingredient_store_location" VALUES (19889,105,7);
INSERT INTO "ingredient_store_location" VALUES (19890,103,7);
INSERT INTO "ingredient_store_location" VALUES (19891,108,7);
INSERT INTO "ingredient_store_location" VALUES (19892,110,7);
INSERT INTO "ingredient_store_location" VALUES (19893,109,7);
INSERT INTO "ingredient_store_location" VALUES (19894,351,7);
INSERT INTO "ingredient_store_location" VALUES (19895,107,7);
INSERT INTO "ingredient_store_location" VALUES (19896,378,7);
INSERT INTO "ingredient_store_location" VALUES (19897,111,7);
INSERT INTO "ingredient_store_location" VALUES (19898,104,7);
INSERT INTO "ingredient_store_location" VALUES (19899,102,7);
INSERT INTO "ingredient_store_location" VALUES (19900,106,7);
INSERT INTO "ingredient_store_location" VALUES (19901,100,6);
INSERT INTO "ingredient_store_location" VALUES (19902,99,6);
INSERT INTO "ingredient_store_location" VALUES (19903,101,6);
INSERT INTO "ingredient_store_location" VALUES (19904,345,6);
INSERT INTO "ingredient_store_location" VALUES (19905,372,6);
INSERT INTO "ingredient_store_location" VALUES (19906,110,8);
INSERT INTO "ingredient_store_location" VALUES (19907,109,8);
INSERT INTO "ingredient_store_location" VALUES (19908,111,8);
INSERT INTO "ingredient_store_location" VALUES (19909,311,8);
INSERT INTO "ingredient_store_location" VALUES (19910,122,9);
INSERT INTO "ingredient_store_location" VALUES (19911,134,9);
INSERT INTO "ingredient_store_location" VALUES (19912,303,9);
INSERT INTO "ingredient_store_location" VALUES (19913,162,9);
INSERT INTO "ingredient_store_location" VALUES (19914,117,9);
INSERT INTO "ingredient_store_location" VALUES (19915,371,9);
INSERT INTO "ingredient_store_location" VALUES (19916,328,9);
INSERT INTO "ingredient_store_location" VALUES (19917,116,9);
INSERT INTO "ingredient_store_location" VALUES (19918,377,9);
INSERT INTO "ingredient_store_location" VALUES (19919,138,9);
INSERT INTO "ingredient_store_location" VALUES (19920,113,9);
INSERT INTO "ingredient_store_location" VALUES (19921,119,9);
INSERT INTO "ingredient_store_location" VALUES (19922,376,9);
INSERT INTO "ingredient_store_location" VALUES (19923,304,9);
INSERT INTO "ingredient_store_location" VALUES (19924,118,9);
INSERT INTO "ingredient_store_location" VALUES (19925,114,9);
INSERT INTO "ingredient_store_location" VALUES (19926,112,9);
INSERT INTO "ingredient_store_location" VALUES (19927,281,9);
INSERT INTO "ingredient_store_location" VALUES (19928,274,9);
INSERT INTO "ingredient_store_location" VALUES (19929,150,9);
INSERT INTO "ingredient_store_location" VALUES (19930,164,9);
INSERT INTO "ingredient_store_location" VALUES (19931,133,11);
INSERT INTO "ingredient_store_location" VALUES (19932,257,11);
INSERT INTO "ingredient_store_location" VALUES (19933,333,11);
INSERT INTO "ingredient_store_location" VALUES (19934,238,11);
INSERT INTO "ingredient_store_location" VALUES (19935,327,11);
INSERT INTO "ingredient_store_location" VALUES (19936,340,11);
INSERT INTO "ingredient_store_location" VALUES (19937,131,11);
INSERT INTO "ingredient_store_location" VALUES (19938,354,11);
INSERT INTO "ingredient_store_location" VALUES (19939,332,11);
INSERT INTO "ingredient_store_location" VALUES (19940,130,11);
INSERT INTO "ingredient_store_location" VALUES (19941,125,11);
INSERT INTO "ingredient_store_location" VALUES (19942,137,38);
INSERT INTO "ingredient_store_location" VALUES (19943,324,38);
INSERT INTO "ingredient_store_location" VALUES (19944,107,38);
INSERT INTO "ingredient_store_location" VALUES (19945,147,38);
INSERT INTO "ingredient_store_location" VALUES (19946,106,38);
INSERT INTO "ingredient_store_location" VALUES (19947,316,39);
INSERT INTO "ingredient_store_location" VALUES (19948,319,40);
INSERT INTO "ingredient_store_location" VALUES (19949,110,40);
INSERT INTO "ingredient_store_location" VALUES (19950,111,40);
INSERT INTO "ingredient_store_location" VALUES (19951,277,41);
INSERT INTO "ingredient_store_location" VALUES (19952,352,41);
INSERT INTO "ingredient_store_location" VALUES (19953,105,42);
INSERT INTO "ingredient_store_location" VALUES (19954,103,42);
INSERT INTO "ingredient_store_location" VALUES (19955,378,42);
INSERT INTO "ingredient_store_location" VALUES (19956,102,42);
INSERT INTO "ingredient_store_location" VALUES (19957,27,43);
INSERT INTO "ingredient_store_location" VALUES (19958,353,43);
INSERT INTO "ingredient_store_location" VALUES (19959,30,43);
INSERT INTO "ingredient_store_location" VALUES (19960,28,43);
INSERT INTO "ingredient_store_location" VALUES (19961,139,43);
INSERT INTO "ingredient_store_location" VALUES (19962,275,43);
INSERT INTO "ingredient_store_location" VALUES (19963,370,43);
INSERT INTO "ingredient_store_location" VALUES (19964,296,43);
INSERT INTO "ingredient_store_location" VALUES (19965,69,43);
INSERT INTO "ingredient_store_location" VALUES (19966,373,43);
INSERT INTO "ingredient_store_location" VALUES (19967,24,43);
INSERT INTO "ingredient_store_location" VALUES (19968,22,43);
INSERT INTO "ingredient_store_location" VALUES (19969,23,43);
INSERT INTO "ingredient_store_location" VALUES (19970,25,43);
INSERT INTO "ingredient_store_location" VALUES (19971,20,43);
INSERT INTO "ingredient_store_location" VALUES (19972,70,43);
INSERT INTO "ingredient_store_location" VALUES (19973,276,43);
INSERT INTO "ingredient_store_location" VALUES (19974,282,43);
INSERT INTO "ingredient_store_location" VALUES (19975,16,43);
INSERT INTO "ingredient_store_location" VALUES (19976,26,43);
INSERT INTO "ingredient_store_location" VALUES (19977,33,43);
INSERT INTO "ingredient_store_location" VALUES (19978,294,43);
INSERT INTO "ingredient_store_location" VALUES (19979,15,43);
INSERT INTO "ingredient_store_location" VALUES (19980,298,43);
INSERT INTO "ingredient_store_location" VALUES (19981,285,43);
INSERT INTO "ingredient_store_location" VALUES (19982,290,43);
INSERT INTO "ingredient_store_location" VALUES (19983,13,43);
INSERT INTO "ingredient_store_location" VALUES (19984,252,43);
INSERT INTO "ingredient_store_location" VALUES (19985,35,43);
INSERT INTO "ingredient_store_location" VALUES (19986,286,43);
INSERT INTO "ingredient_store_location" VALUES (19987,299,43);
INSERT INTO "ingredient_store_location" VALUES (19988,14,43);
INSERT INTO "ingredient_store_location" VALUES (19989,323,43);
INSERT INTO "ingredient_store_location" VALUES (19990,34,43);
INSERT INTO "ingredient_store_location" VALUES (19991,18,43);
INSERT INTO "ingredient_store_location" VALUES (19992,32,43);
INSERT INTO "ingredient_store_location" VALUES (19993,140,43);
INSERT INTO "ingredient_store_location" VALUES (19994,258,43);
INSERT INTO "ingredient_store_location" VALUES (19995,73,43);
INSERT INTO "ingredient_store_location" VALUES (19996,300,43);
INSERT INTO "ingredient_store_location" VALUES (19997,31,43);
INSERT INTO "ingredient_store_location" VALUES (19998,210,43);
INSERT INTO "ingredient_store_location" VALUES (19999,289,43);
INSERT INTO "ingredient_store_location" VALUES (20000,21,43);
INSERT INTO "ingredient_store_location" VALUES (20001,36,43);
INSERT INTO "ingredient_store_location" VALUES (20002,71,43);
INSERT INTO "ingredient_store_location" VALUES (20003,209,43);
INSERT INTO "ingredient_store_location" VALUES (20004,310,43);
INSERT INTO "ingredient_store_location" VALUES (20005,29,43);
INSERT INTO "ingredient_store_location" VALUES (20006,278,43);
INSERT INTO "ingredient_store_location" VALUES (20007,261,44);
INSERT INTO "ingredient_store_location" VALUES (20008,139,44);
INSERT INTO "ingredient_store_location" VALUES (20009,134,44);
INSERT INTO "ingredient_store_location" VALUES (20010,337,44);
INSERT INTO "ingredient_store_location" VALUES (20011,165,44);
INSERT INTO "ingredient_store_location" VALUES (20012,317,44);
INSERT INTO "ingredient_store_location" VALUES (20013,166,44);
INSERT INTO "ingredient_store_location" VALUES (20014,329,44);
INSERT INTO "ingredient_store_location" VALUES (20015,124,44);
INSERT INTO "ingredient_store_location" VALUES (20016,163,44);
INSERT INTO "ingredient_store_location" VALUES (20017,162,44);
INSERT INTO "ingredient_store_location" VALUES (20018,336,44);
INSERT INTO "ingredient_store_location" VALUES (20019,371,44);
INSERT INTO "ingredient_store_location" VALUES (20020,377,44);
INSERT INTO "ingredient_store_location" VALUES (20021,138,44);
INSERT INTO "ingredient_store_location" VALUES (20022,294,44);
INSERT INTO "ingredient_store_location" VALUES (20023,326,44);
INSERT INTO "ingredient_store_location" VALUES (20024,376,44);
INSERT INTO "ingredient_store_location" VALUES (20025,259,44);
INSERT INTO "ingredient_store_location" VALUES (20026,262,44);
INSERT INTO "ingredient_store_location" VALUES (20027,114,44);
INSERT INTO "ingredient_store_location" VALUES (20028,8,44);
INSERT INTO "ingredient_store_location" VALUES (20029,94,44);
INSERT INTO "ingredient_store_location" VALUES (20030,281,44);
INSERT INTO "ingredient_store_location" VALUES (20031,140,44);
INSERT INTO "ingredient_store_location" VALUES (20032,274,44);
INSERT INTO "ingredient_store_location" VALUES (20033,17,44);
INSERT INTO "ingredient_store_location" VALUES (20034,289,44);
INSERT INTO "ingredient_store_location" VALUES (20035,150,44);
INSERT INTO "ingredient_store_location" VALUES (20036,159,44);
INSERT INTO "ingredient_store_location" VALUES (20037,293,44);
INSERT INTO "ingredient_store_location" VALUES (20038,291,44);
INSERT INTO "ingredient_store_location" VALUES (20039,375,44);
INSERT INTO "ingredient_store_location" VALUES (20040,91,44);
INSERT INTO "ingredient_store_location" VALUES (20041,164,44);
INSERT INTO "ingredient_store_location" VALUES (20042,7,44);
INSERT INTO "ingredient_store_location" VALUES (20043,96,45);
INSERT INTO "ingredient_store_location" VALUES (20044,288,45);
INSERT INTO "ingredient_store_location" VALUES (20045,335,45);
INSERT INTO "ingredient_store_location" VALUES (20046,334,45);
INSERT INTO "ingredient_store_location" VALUES (20047,161,45);
INSERT INTO "ingredient_store_location" VALUES (20048,93,45);
INSERT INTO "ingredient_store_location" VALUES (20049,246,45);
INSERT INTO "ingredient_store_location" VALUES (20050,92,45);
INSERT INTO "ingredient_store_location" VALUES (20051,97,45);
INSERT INTO "ingredient_store_location" VALUES (20052,279,45);
INSERT INTO "ingredient_store_location" VALUES (20053,167,45);
INSERT INTO "ingredient_store_location" VALUES (20054,122,46);
INSERT INTO "ingredient_store_location" VALUES (20055,86,46);
INSERT INTO "ingredient_store_location" VALUES (20056,100,46);
INSERT INTO "ingredient_store_location" VALUES (20057,153,46);
INSERT INTO "ingredient_store_location" VALUES (20058,99,46);
INSERT INTO "ingredient_store_location" VALUES (20059,256,46);
INSERT INTO "ingredient_store_location" VALUES (20060,101,46);
INSERT INTO "ingredient_store_location" VALUES (20061,82,46);
INSERT INTO "ingredient_store_location" VALUES (20062,303,46);
INSERT INTO "ingredient_store_location" VALUES (20063,117,46);
INSERT INTO "ingredient_store_location" VALUES (20064,345,46);
INSERT INTO "ingredient_store_location" VALUES (20065,116,46);
INSERT INTO "ingredient_store_location" VALUES (20066,119,46);
INSERT INTO "ingredient_store_location" VALUES (20067,120,46);
INSERT INTO "ingredient_store_location" VALUES (20068,118,46);
INSERT INTO "ingredient_store_location" VALUES (20069,121,46);
INSERT INTO "ingredient_store_location" VALUES (20070,325,46);
INSERT INTO "ingredient_store_location" VALUES (20071,85,46);
INSERT INTO "ingredient_store_location" VALUES (20072,372,46);
INSERT INTO "ingredient_store_location" VALUES (20073,3,46);
INSERT INTO "ingredient_store_location" VALUES (20074,81,46);
INSERT INTO "ingredient_store_location" VALUES (20075,87,46);
INSERT INTO "ingredient_store_location" VALUES (20076,312,46);
INSERT INTO "ingredient_store_location" VALUES (20077,302,47);
INSERT INTO "ingredient_store_location" VALUES (20078,113,47);
INSERT INTO "ingredient_store_location" VALUES (20079,304,47);
INSERT INTO "ingredient_store_location" VALUES (20080,315,47);
INSERT INTO "ingredient_store_location" VALUES (20081,112,47);
INSERT INTO "ingredient_store_location" VALUES (20082,314,47);
INSERT INTO "ingredient_store_location" VALUES (20083,68,48);
INSERT INTO "ingredient_store_location" VALUES (20084,88,48);
INSERT INTO "ingredient_store_location" VALUES (20085,89,48);
INSERT INTO "ingredient_store_location" VALUES (20086,83,49);
INSERT INTO "ingredient_store_location" VALUES (20087,80,49);
INSERT INTO "ingredient_store_location" VALUES (20088,311,53);
INSERT INTO "ingredient_store_location" VALUES (20089,79,51);
INSERT INTO "ingredient_store_location" VALUES (20090,299,51);
INSERT INTO "ingredient_store_location" VALUES (20091,300,51);
INSERT INTO "ingredient_store_location" VALUES (20092,280,51);
INSERT INTO "ingredient_store_location" VALUES (20093,133,50);
INSERT INTO "ingredient_store_location" VALUES (20094,135,50);
INSERT INTO "ingredient_store_location" VALUES (20095,333,50);
INSERT INTO "ingredient_store_location" VALUES (20096,142,50);
INSERT INTO "ingredient_store_location" VALUES (20097,339,50);
INSERT INTO "ingredient_store_location" VALUES (20098,340,50);
INSERT INTO "ingredient_store_location" VALUES (20099,341,50);
INSERT INTO "ingredient_store_location" VALUES (20100,332,50);
INSERT INTO "ingredient_store_location" VALUES (20101,130,50);
INSERT INTO "ingredient_store_location" VALUES (20102,257,52);
INSERT INTO "ingredient_store_location" VALUES (20103,354,52);
INSERT INTO "ingredient_store_location" VALUES (20104,125,52);
INSERT INTO "ingredient_store_location" VALUES (20105,306,54);
INSERT INTO "ingredient_store_location" VALUES (20106,72,54);
INSERT INTO "ingredient_store_location" VALUES (20107,74,54);
INSERT INTO "ingredient_store_location" VALUES (20108,75,54);
INSERT INTO "ingredient_store_location" VALUES (20109,109,54);
INSERT INTO "ingredient_store_location" VALUES (20110,73,54);
INSERT INTO "ingredient_store_location" VALUES (20111,318,54);
INSERT INTO "ingredient_store_location" VALUES (20112,379,54);
INSERT INTO "ingredient_store_location" VALUES (20113,128,55);
INSERT INTO "ingredient_store_location" VALUES (20114,287,56);
INSERT INTO "ingredient_synonyms" VALUES (1,242,'pee pee');
INSERT INTO "ingredient_synonyms" VALUES (3,243,'beer');
INSERT INTO "ingredient_synonyms" VALUES (6,160,'bullion');
INSERT INTO "ingredient_synonyms" VALUES (7,283,'bbb');
INSERT INTO "ingredient_synonyms" VALUES (8,284,'aaa_aka');
INSERT INTO "ingredient_synonyms" VALUES (15,319,'baba ganoush');
INSERT INTO "ingredient_synonyms" VALUES (19,317,'ketchup');
INSERT INTO "ingredient_synonyms" VALUES (20,16,'tangerine');
INSERT INTO "ingredient_synonyms" VALUES (21,252,'lemon juice');
INSERT INTO "ingredient_synonyms" VALUES (22,107,'pumpkin seeds');
INSERT INTO "ingredient_variant_store_location" VALUES (2267,492,1);
INSERT INTO "ingredient_variant_store_location" VALUES (2268,226,1);
INSERT INTO "ingredient_variant_store_location" VALUES (2269,727,3);
INSERT INTO "ingredient_variant_store_location" VALUES (2270,729,4);
INSERT INTO "ingredient_variant_store_location" VALUES (2271,159,5);
INSERT INTO "ingredient_variant_store_location" VALUES (2272,250,5);
INSERT INTO "ingredient_variant_store_location" VALUES (2273,207,5);
INSERT INTO "ingredient_variant_store_location" VALUES (2274,752,5);
INSERT INTO "ingredient_variant_store_location" VALUES (2275,753,5);
INSERT INTO "ingredient_variant_store_location" VALUES (2276,237,11);
INSERT INTO "ingredient_variant_store_location" VALUES (2277,238,11);
INSERT INTO "ingredient_variant_store_location" VALUES (2278,244,38);
INSERT INTO "ingredient_variant_store_location" VALUES (2279,260,43);
INSERT INTO "ingredient_variant_store_location" VALUES (2280,223,43);
INSERT INTO "ingredient_variant_store_location" VALUES (2281,226,43);
INSERT INTO "ingredient_variant_store_location" VALUES (2282,232,43);
INSERT INTO "ingredient_variant_store_location" VALUES (2283,25,44);
INSERT INTO "ingredient_variant_store_location" VALUES (2284,217,44);
INSERT INTO "ingredient_variant_store_location" VALUES (2285,3,44);
INSERT INTO "ingredient_variant_store_location" VALUES (2286,26,44);
INSERT INTO "ingredient_variant_store_location" VALUES (2287,218,44);
INSERT INTO "ingredient_variant_store_location" VALUES (2288,195,44);
INSERT INTO "ingredient_variant_store_location" VALUES (2289,752,45);
INSERT INTO "ingredient_variant_store_location" VALUES (2290,753,45);
INSERT INTO "ingredient_variant_store_location" VALUES (2291,255,50);
INSERT INTO "ingredient_variant_store_location" VALUES (2292,727,54);
INSERT INTO "ingredient_variant_tag_map" VALUES (8,581,35,1);
INSERT INTO "ingredient_variant_tag_map" VALUES (9,582,35,1);
INSERT INTO "ingredient_variant_tag_map" VALUES (10,585,35,1);
INSERT INTO "ingredient_variant_tag_map" VALUES (11,587,35,1);
INSERT INTO "ingredient_variant_tag_map" VALUES (12,588,35,1);
INSERT INTO "ingredient_variant_tag_map" VALUES (13,589,35,1);
INSERT INTO "ingredient_variant_tag_map" VALUES (14,591,35,1);
INSERT INTO "ingredient_variant_tag_map" VALUES (15,593,35,1);
INSERT INTO "ingredient_variant_tag_map" VALUES (16,597,35,1);
INSERT INTO "ingredient_variant_tag_map" VALUES (17,599,35,1);
INSERT INTO "ingredient_variant_tag_map" VALUES (19,602,35,1);
INSERT INTO "ingredient_variant_tag_map" VALUES (20,604,35,1);
INSERT INTO "ingredient_variant_tag_map" VALUES (21,607,35,1);
INSERT INTO "ingredient_variant_tag_map" VALUES (22,610,35,1);
INSERT INTO "ingredient_variant_tag_map" VALUES (23,611,35,1);
INSERT INTO "ingredient_variant_tag_map" VALUES (24,613,35,1);
INSERT INTO "ingredient_variant_tag_map" VALUES (26,625,35,1);
INSERT INTO "ingredient_variant_tag_map" VALUES (27,626,35,1);
INSERT INTO "ingredient_variant_tag_map" VALUES (28,628,35,1);
INSERT INTO "ingredient_variant_tag_map" VALUES (29,629,35,1);
INSERT INTO "ingredient_variant_tag_map" VALUES (30,630,35,1);
INSERT INTO "ingredient_variant_tag_map" VALUES (31,632,35,1);
INSERT INTO "ingredient_variant_tag_map" VALUES (33,634,35,1);
INSERT INTO "ingredient_variant_tag_map" VALUES (34,636,35,1);
INSERT INTO "ingredient_variant_tag_map" VALUES (35,638,35,1);
INSERT INTO "ingredient_variant_tag_map" VALUES (37,642,35,1);
INSERT INTO "ingredient_variant_tag_map" VALUES (38,645,35,1);
INSERT INTO "ingredient_variant_tag_map" VALUES (40,649,35,1);
INSERT INTO "ingredient_variant_tag_map" VALUES (41,650,35,1);
INSERT INTO "ingredient_variant_tag_map" VALUES (42,651,35,1);
INSERT INTO "ingredient_variant_tag_map" VALUES (43,652,35,1);
INSERT INTO "ingredient_variant_tag_map" VALUES (44,654,35,1);
INSERT INTO "ingredient_variant_tag_map" VALUES (45,655,35,1);
INSERT INTO "ingredient_variant_tag_map" VALUES (46,658,35,1);
INSERT INTO "ingredient_variant_tag_map" VALUES (47,659,35,1);
INSERT INTO "ingredient_variant_tag_map" VALUES (48,661,35,1);
INSERT INTO "ingredient_variant_tag_map" VALUES (49,662,35,1);
INSERT INTO "ingredient_variant_tag_map" VALUES (50,663,35,1);
INSERT INTO "ingredient_variant_tag_map" VALUES (51,666,35,1);
INSERT INTO "ingredient_variant_tag_map" VALUES (52,668,35,1);
INSERT INTO "ingredient_variant_tag_map" VALUES (53,670,35,1);
INSERT INTO "ingredient_variant_tag_map" VALUES (54,671,35,1);
INSERT INTO "ingredient_variant_tag_map" VALUES (55,672,35,1);
INSERT INTO "ingredient_variant_tag_map" VALUES (56,673,35,1);
INSERT INTO "ingredient_variant_tag_map" VALUES (57,674,35,1);
INSERT INTO "ingredient_variant_tag_map" VALUES (58,677,35,1);
INSERT INTO "ingredient_variant_tag_map" VALUES (59,678,35,1);
INSERT INTO "ingredient_variant_tag_map" VALUES (60,679,35,1);
INSERT INTO "ingredient_variant_tag_map" VALUES (61,682,35,1);
INSERT INTO "ingredient_variant_tag_map" VALUES (62,683,35,1);
INSERT INTO "ingredient_variant_tag_map" VALUES (63,685,35,1);
INSERT INTO "ingredient_variant_tag_map" VALUES (64,688,35,1);
INSERT INTO "ingredient_variant_tag_map" VALUES (65,689,35,1);
INSERT INTO "ingredient_variant_tag_map" VALUES (66,693,35,1);
INSERT INTO "ingredient_variant_tag_map" VALUES (67,694,35,1);
INSERT INTO "ingredient_variant_tag_map" VALUES (69,697,35,1);
INSERT INTO "ingredient_variant_tag_map" VALUES (70,698,35,1);
INSERT INTO "ingredient_variant_tag_map" VALUES (71,700,35,1);
INSERT INTO "ingredient_variant_tag_map" VALUES (72,701,35,1);
INSERT INTO "ingredient_variant_tag_map" VALUES (73,704,35,1);
INSERT INTO "ingredient_variant_tag_map" VALUES (74,708,35,1);
INSERT INTO "ingredient_variant_tag_map" VALUES (75,709,35,1);
INSERT INTO "ingredient_variant_tag_map" VALUES (76,712,35,1);
INSERT INTO "ingredient_variant_tag_map" VALUES (77,713,35,1);
INSERT INTO "ingredient_variant_tag_map" VALUES (79,719,35,1);
INSERT INTO "ingredient_variant_tag_map" VALUES (81,726,35,1);
INSERT INTO "ingredient_variant_tag_map" VALUES (82,728,37,1);
INSERT INTO "ingredient_variant_tag_map" VALUES (83,730,37,1);
INSERT INTO "ingredient_variant_tag_map" VALUES (84,731,37,1);
INSERT INTO "ingredient_variant_tag_map" VALUES (85,732,37,1);
INSERT INTO "ingredient_variant_tag_map" VALUES (86,733,37,1);
INSERT INTO "ingredient_variant_tag_map" VALUES (87,734,37,1);
INSERT INTO "ingredient_variant_tag_map" VALUES (88,735,37,1);
INSERT INTO "ingredient_variant_tag_map" VALUES (89,736,37,1);
INSERT INTO "ingredient_variant_tag_map" VALUES (90,737,37,1);
INSERT INTO "ingredient_variant_tag_map" VALUES (91,738,37,1);
INSERT INTO "ingredient_variant_tag_map" VALUES (92,740,37,1);
INSERT INTO "ingredient_variant_tag_map" VALUES (93,742,37,1);
INSERT INTO "ingredient_variant_tag_map" VALUES (94,743,37,1);
INSERT INTO "ingredient_variant_tag_map" VALUES (95,744,37,1);
INSERT INTO "ingredient_variant_tag_map" VALUES (96,746,37,1);
INSERT INTO "ingredient_variant_tag_map" VALUES (97,748,37,1);
INSERT INTO "ingredient_variant_tag_map" VALUES (98,749,37,1);
INSERT INTO "ingredient_variant_tag_map" VALUES (99,751,37,1);
INSERT INTO "ingredient_variant_tag_map" VALUES (100,754,37,1);
INSERT INTO "ingredient_variant_tag_map" VALUES (101,755,37,1);
INSERT INTO "ingredient_variant_tag_map" VALUES (102,759,37,1);
INSERT INTO "ingredient_variant_tag_map" VALUES (103,761,37,1);
INSERT INTO "ingredient_variant_tag_map" VALUES (104,762,37,1);
INSERT INTO "ingredient_variant_tag_map" VALUES (105,765,37,1);
INSERT INTO "ingredient_variant_tag_map" VALUES (106,766,35,1);
INSERT INTO "ingredient_variant_tag_map" VALUES (107,769,35,1);
INSERT INTO "ingredient_variant_tag_map" VALUES (108,770,35,1);
INSERT INTO "ingredient_variant_tag_map" VALUES (110,778,37,1);
INSERT INTO "ingredient_variants" VALUES (3,8,'canola',1,'none',0);
INSERT INTO "ingredient_variants" VALUES (4,19,'fresh',1,'none',0);
INSERT INTO "ingredient_variants" VALUES (5,22,'purple',1,'none',0);
INSERT INTO "ingredient_variants" VALUES (6,32,'yellow',1,'none',0);
INSERT INTO "ingredient_variants" VALUES (7,34,'Baby Bella',1,'none',0);
INSERT INTO "ingredient_variants" VALUES (16,75,'frozen',1,'none',0);
INSERT INTO "ingredient_variants" VALUES (25,139,'dried',1,'none',0);
INSERT INTO "ingredient_variants" VALUES (26,140,'dried',1,'none',0);
INSERT INTO "ingredient_variants" VALUES (27,141,'no-boil',1,'none',0);
INSERT INTO "ingredient_variants" VALUES (28,142,'vegan',1,'none',0);
INSERT INTO "ingredient_variants" VALUES (31,161,'red',1,'none',0);
INSERT INTO "ingredient_variants" VALUES (32,162,'ground',1,'none',0);
INSERT INTO "ingredient_variants" VALUES (33,163,'ground',1,'none',0);
INSERT INTO "ingredient_variants" VALUES (34,164,'ground',1,'none',0);
INSERT INTO "ingredient_variants" VALUES (35,165,'ground',1,'none',0);
INSERT INTO "ingredient_variants" VALUES (36,166,'ground',1,'none',0);
INSERT INTO "ingredient_variants" VALUES (45,77,'Beyond',1,'none',0);
INSERT INTO "ingredient_variants" VALUES (48,179,'white',1,'none',0);
INSERT INTO "ingredient_variants" VALUES (49,179,'gray',2,'none',0);
INSERT INTO "ingredient_variants" VALUES (105,84,'all purpose',1,'none',0);
INSERT INTO "ingredient_variants" VALUES (121,233,'frozen',1,'none',0);
INSERT INTO "ingredient_variants" VALUES (131,12,'raspberry',1,'none',0);
INSERT INTO "ingredient_variants" VALUES (132,12,'blueberry',2,'none',0);
INSERT INTO "ingredient_variants" VALUES (133,12,'strawberry',3,'none',0);
INSERT INTO "ingredient_variants" VALUES (146,155,'macadamia',1,'none',0);
INSERT INTO "ingredient_variants" VALUES (159,259,'Dijon',1,'none',0);
INSERT INTO "ingredient_variants" VALUES (161,262,'ground',1,'none',0);
INSERT INTO "ingredient_variants" VALUES (164,139,'fresh',2,'none',0);
INSERT INTO "ingredient_variants" VALUES (165,125,'vegan',0,'none',0);
INSERT INTO "ingredient_variants" VALUES (173,274,'smoked',1,'none',0);
INSERT INTO "ingredient_variants" VALUES (180,160,'vegetable',1,'none',0);
INSERT INTO "ingredient_variants" VALUES (181,160,'No Beef',2,'none',0);
INSERT INTO "ingredient_variants" VALUES (182,160,'No Chicken',3,'none',0);
INSERT INTO "ingredient_variants" VALUES (192,287,'cooking',1,'none',0);
INSERT INTO "ingredient_variants" VALUES (195,291,'Italian',1,'none',0);
INSERT INTO "ingredient_variants" VALUES (206,294,'pickled',1,'none',0);
INSERT INTO "ingredient_variants" VALUES (207,293,'toasted',1,'none',0);
INSERT INTO "ingredient_variants" VALUES (217,294,'powdered',2,'none',0);
INSERT INTO "ingredient_variants" VALUES (218,289,'dried',1,'none',0);
INSERT INTO "ingredient_variants" VALUES (221,294,'fresh',3,'none',0);
INSERT INTO "ingredient_variants" VALUES (223,140,'fresh',2,'none',0);
INSERT INTO "ingredient_variants" VALUES (226,289,'fresh',2,'none',0);
INSERT INTO "ingredient_variants" VALUES (232,310,'fresh',1,'none',0);
INSERT INTO "ingredient_variants" VALUES (237,257,'chive',1,'none',0);
INSERT INTO "ingredient_variants" VALUES (238,257,'plain',2,'none',0);
INSERT INTO "ingredient_variants" VALUES (242,139,'Thai',3,'none',0);
INSERT INTO "ingredient_variants" VALUES (244,324,'roasted',1,'none',0);
INSERT INTO "ingredient_variants" VALUES (245,325,'smooth',1,'none',0);
INSERT INTO "ingredient_variants" VALUES (250,259,'yellow',2,'none',0);
INSERT INTO "ingredient_variants" VALUES (254,8,'cooking',2,'none',0);
INSERT INTO "ingredient_variants" VALUES (255,341,'Impossible',1,'none',0);
INSERT INTO "ingredient_variants" VALUES (260,323,'fresh',1,'none',0);
INSERT INTO "ingredient_variants" VALUES (265,288,'crushed',1,'none',0);
INSERT INTO "ingredient_variants" VALUES (266,288,'whole',2,'none',0);
INSERT INTO "ingredient_variants" VALUES (270,316,'Marcona',1,'none',0);
INSERT INTO "ingredient_variants" VALUES (273,329,'ground',1,'none',0);
INSERT INTO "ingredient_variants" VALUES (274,329,'whole',2,'none',0);
INSERT INTO "ingredient_variants" VALUES (275,336,'dried',1,'none',0);
INSERT INTO "ingredient_variants" VALUES (278,8,'default',0,'pantry',0);
INSERT INTO "ingredient_variants" VALUES (279,9,'default',0,'none',0);
INSERT INTO "ingredient_variants" VALUES (281,14,'default',0,'fridge',0);
INSERT INTO "ingredient_variants" VALUES (282,15,'default',0,'fridge',0);
INSERT INTO "ingredient_variants" VALUES (284,17,'default',0,'fruit stand',0);
INSERT INTO "ingredient_variants" VALUES (285,18,'default',0,'fruit stand',0);
INSERT INTO "ingredient_variants" VALUES (286,20,'default',0,'fridge',0);
INSERT INTO "ingredient_variants" VALUES (287,21,'default',0,'fridge',0);
INSERT INTO "ingredient_variants" VALUES (288,22,'default',0,'fridge',0);
INSERT INTO "ingredient_variants" VALUES (291,25,'default',0,'fridge',0);
INSERT INTO "ingredient_variants" VALUES (294,28,'default',0,'fruit stand',0);
INSERT INTO "ingredient_variants" VALUES (297,31,'default',0,'pantry',0);
INSERT INTO "ingredient_variants" VALUES (298,32,'default',0,'fridge',0);
INSERT INTO "ingredient_variants" VALUES (299,33,'default',0,'pantry',0);
INSERT INTO "ingredient_variants" VALUES (300,34,'default',0,'fridge',0);
INSERT INTO "ingredient_variants" VALUES (314,75,'default',0,'freezer',0);
INSERT INTO "ingredient_variants" VALUES (316,79,'default',0,'freezer',0);
INSERT INTO "ingredient_variants" VALUES (327,91,'default',0,'coffee bar',0);
INSERT INTO "ingredient_variants" VALUES (340,106,'default',0,'cereal cabinet',0);
INSERT INTO "ingredient_variants" VALUES (342,108,'default',0,'cereal cabinet',0);
INSERT INTO "ingredient_variants" VALUES (356,123,'default',0,'cereal cabinet',0);
INSERT INTO "ingredient_variants" VALUES (357,124,'default',0,'freezer',0);
INSERT INTO "ingredient_variants" VALUES (358,125,'default',0,'fridge',0);
INSERT INTO "ingredient_variants" VALUES (360,129,'default',0,'fridge',0);
INSERT INTO "ingredient_variants" VALUES (362,131,'default',0,'pantry',0);
INSERT INTO "ingredient_variants" VALUES (367,138,'default',0,'spices',0);
INSERT INTO "ingredient_variants" VALUES (368,139,'default',0,'spices',0);
INSERT INTO "ingredient_variants" VALUES (369,140,'default',0,'spices',0);
INSERT INTO "ingredient_variants" VALUES (370,142,'default',0,'fridge',0);
INSERT INTO "ingredient_variants" VALUES (371,147,'default',0,'freezer',0);
INSERT INTO "ingredient_variants" VALUES (373,153,'default',0,'spices',0);
INSERT INTO "ingredient_variants" VALUES (375,160,'default',0,'fridge',0);
INSERT INTO "ingredient_variants" VALUES (376,161,'default',0,'pantry',0);
INSERT INTO "ingredient_variants" VALUES (377,162,'default',0,'spices',0);
INSERT INTO "ingredient_variants" VALUES (378,163,'default',0,'spices',0);
INSERT INTO "ingredient_variants" VALUES (379,164,'default',0,'spices',0);
INSERT INTO "ingredient_variants" VALUES (380,165,'default',0,'spices',0);
INSERT INTO "ingredient_variants" VALUES (381,166,'default',0,'spices',0);
INSERT INTO "ingredient_variants" VALUES (382,167,'default',0,'fridge',0);
INSERT INTO "ingredient_variants" VALUES (383,209,'default',0,'fruit stand',0);
INSERT INTO "ingredient_variants" VALUES (384,210,'default',0,'fridge',0);
INSERT INTO "ingredient_variants" VALUES (388,256,'default',0,'pantry',0);
INSERT INTO "ingredient_variants" VALUES (389,257,'default',0,'fridge',0);
INSERT INTO "ingredient_variants" VALUES (390,258,'default',0,'fridge',0);
INSERT INTO "ingredient_variants" VALUES (391,259,'default',0,'fridge',0);
INSERT INTO "ingredient_variants" VALUES (392,260,'default',0,'fridge',0);
INSERT INTO "ingredient_variants" VALUES (394,262,'default',0,'spices',0);
INSERT INTO "ingredient_variants" VALUES (395,274,'default',0,'spices',0);
INSERT INTO "ingredient_variants" VALUES (396,275,'default',0,'fridge',0);
INSERT INTO "ingredient_variants" VALUES (397,276,'default',0,'fridge',0);
INSERT INTO "ingredient_variants" VALUES (398,277,'default',0,'cereal cabinet',0);
INSERT INTO "ingredient_variants" VALUES (399,278,'default',0,'fridge',0);
INSERT INTO "ingredient_variants" VALUES (401,280,'default',0,'freezer',0);
INSERT INTO "ingredient_variants" VALUES (402,281,'default',0,'spices',0);
INSERT INTO "ingredient_variants" VALUES (403,282,'default',0,'fridge',0);
INSERT INTO "ingredient_variants" VALUES (404,285,'default',0,'fridge',0);
INSERT INTO "ingredient_variants" VALUES (405,286,'default',0,'fridge',0);
INSERT INTO "ingredient_variants" VALUES (406,287,'default',0,'pantry',0);
INSERT INTO "ingredient_variants" VALUES (407,288,'default',0,'pantry',0);
INSERT INTO "ingredient_variants" VALUES (408,289,'default',0,'fridge',0);
INSERT INTO "ingredient_variants" VALUES (409,290,'default',0,'fridge',0);
INSERT INTO "ingredient_variants" VALUES (410,291,'default',0,'spices',0);
INSERT INTO "ingredient_variants" VALUES (411,292,'default',0,'fridge',0);
INSERT INTO "ingredient_variants" VALUES (412,293,'default',0,'fridge',0);
INSERT INTO "ingredient_variants" VALUES (413,294,'default',0,'fridge',0);
INSERT INTO "ingredient_variants" VALUES (414,295,'default',0,'fridge',0);
INSERT INTO "ingredient_variants" VALUES (415,296,'default',0,'fridge',0);
INSERT INTO "ingredient_variants" VALUES (425,310,'default',0,'spices',0);
INSERT INTO "ingredient_variants" VALUES (427,312,'default',0,'pantry',0);
INSERT INTO "ingredient_variants" VALUES (429,315,'default',0,'cereal cabinet',0);
INSERT INTO "ingredient_variants" VALUES (430,316,'default',0,'cereal cabinet',0);
INSERT INTO "ingredient_variants" VALUES (433,319,'default',0,'fridge',0);
INSERT INTO "ingredient_variants" VALUES (434,323,'default',0,'fridge',0);
INSERT INTO "ingredient_variants" VALUES (435,324,'default',0,'pantry',0);
INSERT INTO "ingredient_variants" VALUES (436,325,'default',0,'cereal cabinet',0);
INSERT INTO "ingredient_variants" VALUES (437,326,'default',0,'spices',0);
INSERT INTO "ingredient_variants" VALUES (439,328,'default',0,'spices',0);
INSERT INTO "ingredient_variants" VALUES (440,329,'default',0,'spices',0);
INSERT INTO "ingredient_variants" VALUES (441,330,'default',0,'spices',0);
INSERT INTO "ingredient_variants" VALUES (442,331,'default',0,'fridge',0);
INSERT INTO "ingredient_variants" VALUES (443,332,'default',0,'fridge',0);
INSERT INTO "ingredient_variants" VALUES (445,334,'default',0,'pantry',0);
INSERT INTO "ingredient_variants" VALUES (446,335,'default',0,'fridge',0);
INSERT INTO "ingredient_variants" VALUES (447,336,'default',0,'spices',0);
INSERT INTO "ingredient_variants" VALUES (448,337,'default',0,'spices',0);
INSERT INTO "ingredient_variants" VALUES (449,338,'default',0,'spices',0);
INSERT INTO "ingredient_variants" VALUES (451,340,'default',0,'fridge',0);
INSERT INTO "ingredient_variants" VALUES (452,341,'default',0,'freezer',0);
INSERT INTO "ingredient_variants" VALUES (466,261,'default',0,'spices',0);
INSERT INTO "ingredient_variants" VALUES (467,261,'ground',1,'none',0);
INSERT INTO "ingredient_variants" VALUES (491,31,'Yukon gold',1,'none',0);
INSERT INTO "ingredient_variants" VALUES (492,336,'fresh',2,'none',0);
INSERT INTO "ingredient_variants" VALUES (495,346,'default',0,'none',0);
INSERT INTO "ingredient_variants" VALUES (497,347,'default',0,'none',0);
INSERT INTO "ingredient_variants" VALUES (498,348,'default',0,'none',0);
INSERT INTO "ingredient_variants" VALUES (499,349,'default',0,'none',0);
INSERT INTO "ingredient_variants" VALUES (500,350,'default',0,'none',0);
INSERT INTO "ingredient_variants" VALUES (503,352,'default',0,'none',0);
INSERT INTO "ingredient_variants" VALUES (508,354,'default',0,'none',0);
INSERT INTO "ingredient_variants" VALUES (526,339,'default',0,'freezer',0);
INSERT INTO "ingredient_variants" VALUES (527,339,'Impossible',1,'none',0);
INSERT INTO "ingredient_variants" VALUES (536,137,'default',0,'cereal cabinet',0);
INSERT INTO "ingredient_variants" VALUES (537,137,'raw',1,'none',0);
INSERT INTO "ingredient_variants" VALUES (539,32,'white',2,'none',0);
INSERT INTO "ingredient_variants" VALUES (541,287,'white',2,'none',0);
INSERT INTO "ingredient_variants" VALUES (542,310,'dried',2,'none',0);
INSERT INTO "ingredient_variants" VALUES (543,334,'canned',1,'none',0);
INSERT INTO "ingredient_variants" VALUES (544,363,'default',0,'none',0);
INSERT INTO "ingredient_variants" VALUES (552,366,'default',0,'none',0);
INSERT INTO "ingredient_variants" VALUES (553,367,'default',0,'none',0);
INSERT INTO "ingredient_variants" VALUES (556,369,'default',0,'none',0);
INSERT INTO "ingredient_variants" VALUES (557,367,'fresh',1,'none',0);
INSERT INTO "ingredient_variants" VALUES (559,258,'fresh',1,'none',0);
INSERT INTO "ingredient_variants" VALUES (560,370,'default',0,'none',0);
INSERT INTO "ingredient_variants" VALUES (561,370,'red',1,'none',0);
INSERT INTO "ingredient_variants" VALUES (562,256,'Panko',1,'none',0);
INSERT INTO "ingredient_variants" VALUES (563,140,'ground',3,'none',0);
INSERT INTO "ingredient_variants" VALUES (564,139,'ground',4,'none',0);
INSERT INTO "ingredient_variants" VALUES (565,371,'default',0,'none',0);
INSERT INTO "ingredient_variants" VALUES (566,371,'ground',1,'none',0);
INSERT INTO "ingredient_variants" VALUES (568,372,'default',0,'none',0);
INSERT INTO "ingredient_variants" VALUES (569,372,'sub',1,'none',0);
INSERT INTO "ingredient_variants" VALUES (571,34,'shiitake',2,'none',0);
INSERT INTO "ingredient_variants" VALUES (572,373,'default',0,'none',0);
INSERT INTO "ingredient_variants" VALUES (573,374,'default',0,'none',0);
INSERT INTO "ingredient_variants" VALUES (574,374,'Japanese',1,'none',0);
INSERT INTO "ingredient_variants" VALUES (575,375,'default',0,'none',0);
INSERT INTO "ingredient_variants" VALUES (576,376,'default',0,'none',0);
INSERT INTO "ingredient_variants" VALUES (577,377,'default',0,'none',0);
INSERT INTO "ingredient_variants" VALUES (578,317,'default',0,'fridge',0);
INSERT INTO "ingredient_variants" VALUES (581,298,'default',0,'fridge',0);
INSERT INTO "ingredient_variants" VALUES (582,69,'default',0,'freezer',0);
INSERT INTO "ingredient_variants" VALUES (583,69,'frozen',1,'none',0);
INSERT INTO "ingredient_variants" VALUES (584,69,'fresh',2,'none',0);
INSERT INTO "ingredient_variants" VALUES (585,27,'default',0,'fruit stand',0);
INSERT INTO "ingredient_variants" VALUES (586,27,'Honeycrisp',1,'none',0);
INSERT INTO "ingredient_variants" VALUES (587,30,'default',0,'fridge',0);
INSERT INTO "ingredient_variants" VALUES (588,100,'default',0,'fridge',0);
INSERT INTO "ingredient_variants" VALUES (589,133,'default',0,'freezer',0);
INSERT INTO "ingredient_variants" VALUES (590,133,'Beyond',1,'none',0);
INSERT INTO "ingredient_variants" VALUES (591,306,'default',0,'freezer',0);
INSERT INTO "ingredient_variants" VALUES (592,306,'Beyond',1,'none',0);
INSERT INTO "ingredient_variants" VALUES (593,71,'default',0,'fridge',0);
INSERT INTO "ingredient_variants" VALUES (594,71,'frozen',1,'none',0);
INSERT INTO "ingredient_variants" VALUES (595,71,'fresh',2,'none',0);
INSERT INTO "ingredient_variants" VALUES (596,96,'default',0,'pantry',0);
INSERT INTO "ingredient_variants" VALUES (597,96,'pinto',1,'none',0);
INSERT INTO "ingredient_variants" VALUES (598,96,'cannellini',2,'none',0);
INSERT INTO "ingredient_variants" VALUES (599,96,'black',3,'none',0);
INSERT INTO "ingredient_variants" VALUES (602,35,'default',0,'fridge',0);
INSERT INTO "ingredient_variants" VALUES (603,35,'butter',1,'none',0);
INSERT INTO "ingredient_variants" VALUES (604,23,'default',0,'fridge',0);
INSERT INTO "ingredient_variants" VALUES (605,23,'heirloom',1,'none',0);
INSERT INTO "ingredient_variants" VALUES (606,70,'default',0,'fridge',0);
INSERT INTO "ingredient_variants" VALUES (607,70,'frozen',1,'none',0);
INSERT INTO "ingredient_variants" VALUES (608,70,'fresh',2,'none',0);
INSERT INTO "ingredient_variants" VALUES (609,302,'default',0,'cereal cabinet',0);
INSERT INTO "ingredient_variants" VALUES (610,302,'Cheerios',1,'none',0);
INSERT INTO "ingredient_variants" VALUES (611,78,'default',0,'freezer',0);
INSERT INTO "ingredient_variants" VALUES (612,78,'Gardein Ultimate',1,'none',0);
INSERT INTO "ingredient_variants" VALUES (613,364,'default',0,'none',0);
INSERT INTO "ingredient_variants" VALUES (621,246,'default',0,'pantry',0);
INSERT INTO "ingredient_variants" VALUES (622,246,'lasagna (no-boil)',1,'pantry',0);
INSERT INTO "ingredient_variants" VALUES (623,246,'no-boil',2,'pantry',0);
INSERT INTO "ingredient_variants" VALUES (624,246,'elbow',3,'pantry',0);
INSERT INTO "ingredient_variants" VALUES (625,246,'Chinese',4,'pantry',0);
INSERT INTO "ingredient_variants" VALUES (626,246,'Cup Noodle',5,'pantry',0);
INSERT INTO "ingredient_variants" VALUES (627,246,'Wai Wai',6,'pantry',0);
INSERT INTO "ingredient_variants" VALUES (628,102,'default',0,'pantry',0);
INSERT INTO "ingredient_variants" VALUES (629,16,'default',0,'fruit stand',0);
INSERT INTO "ingredient_variants" VALUES (630,105,'default',0,'pantry',0);
INSERT INTO "ingredient_variants" VALUES (631,72,'default',0,'freezer',0);
INSERT INTO "ingredient_variants" VALUES (632,72,'frozen',1,'none',0);
INSERT INTO "ingredient_variants" VALUES (634,103,'default',0,'pantry',0);
INSERT INTO "ingredient_variants" VALUES (635,103,'cheesey',1,'pantry',0);
INSERT INTO "ingredient_variants" VALUES (636,26,'default',0,'fridge',0);
INSERT INTO "ingredient_variants" VALUES (637,26,'English',1,'none',0);
INSERT INTO "ingredient_variants" VALUES (638,117,'default',0,'coffee bar',0);
INSERT INTO "ingredient_variants" VALUES (642,74,'default',0,'freezer',0);
INSERT INTO "ingredient_variants" VALUES (643,74,'frozen',1,'none',0);
INSERT INTO "ingredient_variants" VALUES (644,74,'shelled frozen',2,'none',0);
INSERT INTO "ingredient_variants" VALUES (645,92,'default',0,'pantry',0);
INSERT INTO "ingredient_variants" VALUES (646,92,'elbow',1,'none',0);
INSERT INTO "ingredient_variants" VALUES (647,92,'fettuccine',2,'none',0);
INSERT INTO "ingredient_variants" VALUES (649,113,'default',0,'cereal cabinet',0);
INSERT INTO "ingredient_variants" VALUES (650,119,'default',0,'pantry',0);
INSERT INTO "ingredient_variants" VALUES (651,110,'default',0,'fridge',0);
INSERT INTO "ingredient_variants" VALUES (652,135,'default',0,'freezer',0);
INSERT INTO "ingredient_variants" VALUES (653,135,'Impossible',1,'none',0);
INSERT INTO "ingredient_variants" VALUES (654,120,'default',0,'fridge',0);
INSERT INTO "ingredient_variants" VALUES (655,109,'default',0,'fridge',0);
INSERT INTO "ingredient_variants" VALUES (656,109,'folded',1,'none',0);
INSERT INTO "ingredient_variants" VALUES (657,109,'liquid',2,'none',0);
INSERT INTO "ingredient_variants" VALUES (658,13,'default',0,'fruit stand',0);
INSERT INTO "ingredient_variants" VALUES (659,252,'default',0,'fridge',0);
INSERT INTO "ingredient_variants" VALUES (660,252,'fresh',1,'none',0);
INSERT INTO "ingredient_variants" VALUES (661,24,'default',0,'fridge',0);
INSERT INTO "ingredient_variants" VALUES (662,304,'default',0,'pantry',0);
INSERT INTO "ingredient_variants" VALUES (663,299,'default',0,'freezer',0);
INSERT INTO "ingredient_variants" VALUES (664,299,'frozen',1,'none',0);
INSERT INTO "ingredient_variants" VALUES (665,299,'fresh',2,'none',0);
INSERT INTO "ingredient_variants" VALUES (666,93,'default',0,'fridge',0);
INSERT INTO "ingredient_variants" VALUES (667,93,'Rao’s',1,'none',0);
INSERT INTO "ingredient_variants" VALUES (668,318,'default',0,'freezer',0);
INSERT INTO "ingredient_variants" VALUES (669,318,'mini',1,'none',0);
INSERT INTO "ingredient_variants" VALUES (670,121,'default',0,'cereal cabinet',0);
INSERT INTO "ingredient_variants" VALUES (671,122,'default',0,'cereal cabinet',0);
INSERT INTO "ingredient_variants" VALUES (672,114,'default',0,'spices',0);
INSERT INTO "ingredient_variants" VALUES (673,112,'default',0,'pantry',0);
INSERT INTO "ingredient_variants" VALUES (674,238,'default',0,'fridge',0);
INSERT INTO "ingredient_variants" VALUES (675,238,'barista',1,'none',0);
INSERT INTO "ingredient_variants" VALUES (676,238,'Oatley',2,'none',0);
INSERT INTO "ingredient_variants" VALUES (677,327,'default',0,'fridge',0);
INSERT INTO "ingredient_variants" VALUES (678,88,'default',0,'none',0);
INSERT INTO "ingredient_variants" VALUES (679,73,'default',0,'freezer',0);
INSERT INTO "ingredient_variants" VALUES (680,73,'frozen',1,'none',0);
INSERT INTO "ingredient_variants" VALUES (681,73,'fresh',2,'none',0);
INSERT INTO "ingredient_variants" VALUES (682,351,'default',0,'none',0);
INSERT INTO "ingredient_variants" VALUES (683,107,'default',0,'cereal cabinet',0);
INSERT INTO "ingredient_variants" VALUES (684,300,'default',0,'freezer',0);
INSERT INTO "ingredient_variants" VALUES (685,300,'frozen',1,'none',0);
INSERT INTO "ingredient_variants" VALUES (686,300,'fresh',2,'none',0);
INSERT INTO "ingredient_variants" VALUES (688,378,'default',0,'pantry',0);
INSERT INTO "ingredient_variants" VALUES (689,97,'default',0,'pantry',0);
INSERT INTO "ingredient_variants" VALUES (690,97,'white',1,'none',0);
INSERT INTO "ingredient_variants" VALUES (691,97,'brown',2,'none',0);
INSERT INTO "ingredient_variants" VALUES (692,97,'uncooked',3,'none',0);
INSERT INTO "ingredient_variants" VALUES (693,111,'default',0,'fridge',0);
INSERT INTO "ingredient_variants" VALUES (694,104,'default',0,'pantry',0);
INSERT INTO "ingredient_variants" VALUES (695,104,'toasted',1,'none',0);
INSERT INTO "ingredient_variants" VALUES (697,314,'default',0,'pantry',0);
INSERT INTO "ingredient_variants" VALUES (698,36,'default',0,'fridge',0);
INSERT INTO "ingredient_variants" VALUES (699,36,'baby',1,'none',0);
INSERT INTO "ingredient_variants" VALUES (700,118,'default',0,'fridge',0);
INSERT INTO "ingredient_variants" VALUES (701,99,'default',0,'fridge',0);
INSERT INTO "ingredient_variants" VALUES (702,99,'Dave’s Killer thin-sliced',1,'none',0);
INSERT INTO "ingredient_variants" VALUES (703,99,'white',2,'none',0);
INSERT INTO "ingredient_variants" VALUES (704,130,'default',0,'fridge',0);
INSERT INTO "ingredient_variants" VALUES (705,130,'firm',1,'none',0);
INSERT INTO "ingredient_variants" VALUES (706,130,'extra firm',2,'none',0);
INSERT INTO "ingredient_variants" VALUES (707,130,'extra-firm',3,'none',0);
INSERT INTO "ingredient_variants" VALUES (708,89,'default',0,'none',0);
INSERT INTO "ingredient_variants" VALUES (709,29,'default',0,'pantry',0);
INSERT INTO "ingredient_variants" VALUES (710,29,'Roma',1,'none',0);
INSERT INTO "ingredient_variants" VALUES (711,29,'cherry',2,'none',0);
INSERT INTO "ingredient_variants" VALUES (712,311,'default',0,'fridge',0);
INSERT INTO "ingredient_variants" VALUES (713,333,'default',0,'fridge',0);
INSERT INTO "ingredient_variants" VALUES (714,333,'Vegenaise',1,'none',0);
INSERT INTO "ingredient_variants" VALUES (719,128,'default',0,'fridge',0);
INSERT INTO "ingredient_variants" VALUES (720,128,'Earth Balance',1,'none',0);
INSERT INTO "ingredient_variants" VALUES (721,128,'sticks',2,'none',0);
INSERT INTO "ingredient_variants" VALUES (722,128,'cultured',3,'none',0);
INSERT INTO "ingredient_variants" VALUES (726,379,'default',0,'freezer',0);
INSERT INTO "ingredient_variants" VALUES (727,379,'toaster',1,'none',0);
INSERT INTO "ingredient_variants" VALUES (728,301,'default',0,'pantry',0);
INSERT INTO "ingredient_variants" VALUES (729,301,'all-purpose',1,'none',0);
INSERT INTO "ingredient_variants" VALUES (730,86,'default',0,'fridge',0);
INSERT INTO "ingredient_variants" VALUES (731,90,'default',0,'none',0);
INSERT INTO "ingredient_variants" VALUES (732,303,'default',0,'spices',0);
INSERT INTO "ingredient_variants" VALUES (733,82,'default',0,'none',0);
INSERT INTO "ingredient_variants" VALUES (734,297,'default',0,'above fridge',0);
INSERT INTO "ingredient_variants" VALUES (735,68,'default',0,'none',0);
INSERT INTO "ingredient_variants" VALUES (736,83,'default',0,'none',0);
INSERT INTO "ingredient_variants" VALUES (737,66,'default',0,'none',0);
INSERT INTO "ingredient_variants" VALUES (738,116,'default',0,'pantry',0);
INSERT INTO "ingredient_variants" VALUES (739,116,'all-purpose',1,'none',0);
INSERT INTO "ingredient_variants" VALUES (740,94,'default',0,'above fridge',0);
INSERT INTO "ingredient_variants" VALUES (741,94,'extra-virgin',1,'none',0);
INSERT INTO "ingredient_variants" VALUES (742,85,'default',0,'pantry',0);
INSERT INTO "ingredient_variants" VALUES (743,134,'default',0,'spices',0);
INSERT INTO "ingredient_variants" VALUES (744,150,'default',0,'spices',0);
INSERT INTO "ingredient_variants" VALUES (745,150,'sea',1,'none',0);
INSERT INTO "ingredient_variants" VALUES (746,159,'default',0,'pantry',0);
INSERT INTO "ingredient_variants" VALUES (747,159,'toasted',1,'none',0);
INSERT INTO "ingredient_variants" VALUES (748,67,'default',0,'none',0);
INSERT INTO "ingredient_variants" VALUES (749,64,'default',0,'none',0);
INSERT INTO "ingredient_variants" VALUES (750,64,'bar',1,'none',0);
INSERT INTO "ingredient_variants" VALUES (751,279,'default',0,'fridge',0);
INSERT INTO "ingredient_variants" VALUES (752,279,'tamari',1,'none',0);
INSERT INTO "ingredient_variants" VALUES (753,279,'shoyu',2,'none',0);
INSERT INTO "ingredient_variants" VALUES (754,80,'default',0,'none',0);
INSERT INTO "ingredient_variants" VALUES (755,3,'default',0,'pantry',0);
INSERT INTO "ingredient_variants" VALUES (756,3,'white',1,'none',0);
INSERT INTO "ingredient_variants" VALUES (757,3,'granulated',2,'none',0);
INSERT INTO "ingredient_variants" VALUES (758,3,'brown',3,'none',0);
INSERT INTO "ingredient_variants" VALUES (759,65,'default',0,'none',0);
INSERT INTO "ingredient_variants" VALUES (761,81,'default',0,'none',0);
INSERT INTO "ingredient_variants" VALUES (762,7,'default',0,'above fridge',0);
INSERT INTO "ingredient_variants" VALUES (763,7,'apple cider',1,'none',0);
INSERT INTO "ingredient_variants" VALUES (764,7,'rice',2,'none',0);
INSERT INTO "ingredient_variants" VALUES (765,87,'default',0,'pantry',0);
INSERT INTO "ingredient_variants" VALUES (766,345,'default',0,'fridge',0);
INSERT INTO "ingredient_variants" VALUES (767,353,'default',0,'none',0);
INSERT INTO "ingredient_variants" VALUES (769,380,'default',0,'fridge',0);
INSERT INTO "ingredient_variants" VALUES (770,101,'default',0,'fridge',0);
INSERT INTO "ingredient_variants" VALUES (771,101,'brioche',1,'none',0);
INSERT INTO "ingredient_variants" VALUES (778,382,'default',0,'none',0);
INSERT INTO "ingredient_variants" VALUES (779,382,'Rawmix Open Prairie',1,'none',0);
INSERT INTO "ingredients" VALUES (3,'sugar','white',NULL,0,'',NULL,1,0,'sugar',0,1,'',0);
INSERT INTO "ingredients" VALUES (7,'vinegar','apple cider',NULL,0,NULL,NULL,1,0,'vinegar',0,1,'',0);
INSERT INTO "ingredients" VALUES (8,'oil','canola',NULL,0,NULL,NULL,1,0,'oil',0,1,NULL,0);
INSERT INTO "ingredients" VALUES (9,'water','','',1,'',NULL,1,0,'water',0,1,'',1);
INSERT INTO "ingredients" VALUES (13,'kiwi','',NULL,0,NULL,'≈1 lemon',1,0,'kiwi',0,0,'',0);
INSERT INTO "ingredients" VALUES (14,'melon','',NULL,0,NULL,NULL,1,0,'melon',0,0,NULL,0);
INSERT INTO "ingredients" VALUES (15,'grapefruit','',NULL,0,NULL,NULL,1,0,'grapefruit',0,0,NULL,0);
INSERT INTO "ingredients" VALUES (16,'clementine','',NULL,0,NULL,NULL,1,0,'clementine',1,0,'',0);
INSERT INTO "ingredients" VALUES (17,'pears','',NULL,0,NULL,NULL,1,0,'pear',0,0,NULL,0);
INSERT INTO "ingredients" VALUES (18,'nectarines','',NULL,0,NULL,NULL,1,0,'nectarine',0,0,NULL,0);
INSERT INTO "ingredients" VALUES (20,'celery','',NULL,0,NULL,NULL,1,0,'celery',0,0,NULL,0);
INSERT INTO "ingredients" VALUES (21,'scallions','',NULL,0,NULL,NULL,1,0,'scallion',1,0,NULL,0);
INSERT INTO "ingredients" VALUES (22,'cabbage','purple',NULL,0,NULL,NULL,1,0,'cabbage',0,0,NULL,0);
INSERT INTO "ingredients" VALUES (23,'carrot','',NULL,0,'large',NULL,1,0,'carrot',0,0,'',0);
INSERT INTO "ingredients" VALUES (24,'broccoli','',NULL,0,NULL,NULL,1,0,'broccoli',0,1,'',0);
INSERT INTO "ingredients" VALUES (25,'cauliflower','',NULL,0,NULL,NULL,1,0,'cauliflower',0,0,NULL,0);
INSERT INTO "ingredients" VALUES (26,'cucumber','',NULL,0,NULL,NULL,1,0,'cucumber',0,0,'',0);
INSERT INTO "ingredients" VALUES (27,'apple','Honeycrisp',NULL,0,'',NULL,1,0,'apple',0,0,'',0);
INSERT INTO "ingredients" VALUES (28,'banana','',NULL,0,'',NULL,1,0,'banana',0,0,'',0);
INSERT INTO "ingredients" VALUES (29,'tomato','',NULL,0,NULL,NULL,1,0,'tomato',1,0,'',0);
INSERT INTO "ingredients" VALUES (30,'avocado','',NULL,0,NULL,NULL,1,0,'avocado',1,0,'',0);
INSERT INTO "ingredients" VALUES (31,'potato','',NULL,0,NULL,NULL,1,0,'potato',0,0,NULL,0);
INSERT INTO "ingredients" VALUES (32,'onion','yellow',NULL,0,'medium-to-large',NULL,1,0,'onion',0,0,NULL,0);
INSERT INTO "ingredients" VALUES (33,'garlic',NULL,NULL,0,NULL,NULL,1,0,'garlic',0,1,'',0);
INSERT INTO "ingredients" VALUES (34,'mushrooms','Baby Bella',NULL,0,NULL,NULL,1,0,'mushroom',0,0,NULL,0);
INSERT INTO "ingredients" VALUES (35,'lettuce','butter',NULL,0,NULL,NULL,1,0,'lettuce',0,1,'',0);
INSERT INTO "ingredients" VALUES (36,'spinach','baby',NULL,0,NULL,NULL,1,0,'spinach',0,1,'',0);
INSERT INTO "ingredients" VALUES (64,'soap','','',0,'',NULL,0,0,'soap',0,1,'',0);
INSERT INTO "ingredients" VALUES (65,'toothpaste','','',0,'',NULL,0,0,'toothpaste',0,1,'',0);
INSERT INTO "ingredients" VALUES (66,'epsom salt','','',0,'',NULL,0,0,'epsom salt',0,1,'',0);
INSERT INTO "ingredients" VALUES (67,'shampoo','','',0,'',NULL,0,0,'shampoo',0,1,'',0);
INSERT INTO "ingredients" VALUES (68,'deodorant','','',0,'',NULL,0,0,'deodorant',0,0,'',0);
INSERT INTO "ingredients" VALUES (69,'blueberries','frozen',NULL,0,NULL,NULL,1,0,'blueberry',0,0,'',0);
INSERT INTO "ingredients" VALUES (70,'cherries','frozen',NULL,0,NULL,NULL,1,0,'cherry',0,0,'',0);
INSERT INTO "ingredients" VALUES (71,'strawberries','frozen',NULL,0,NULL,NULL,1,0,'strawberry',0,0,'',0);
INSERT INTO "ingredients" VALUES (72,'corn','frozen',NULL,0,NULL,NULL,1,0,'corn',0,1,'',0);
INSERT INTO "ingredients" VALUES (73,'pea','frozen',NULL,0,NULL,NULL,1,0,'pea',1,0,'',0);
INSERT INTO "ingredients" VALUES (74,'edamame','frozen',NULL,0,NULL,NULL,1,0,'edamame',0,0,'',0);
INSERT INTO "ingredients" VALUES (75,'fries','frozen',NULL,0,NULL,NULL,1,0,'fry',0,0,NULL,0);
INSERT INTO "ingredients" VALUES (78,'chick’n tenders','Gardein Ultimate',NULL,0,'',NULL,1,0,'chick’n tender',1,0,'',0);
INSERT INTO "ingredients" VALUES (79,'ice cream','',NULL,0,NULL,NULL,1,0,'ice cream',0,1,NULL,0);
INSERT INTO "ingredients" VALUES (80,'sponge','','',0,'',NULL,0,0,'sponge',1,0,'',0);
INSERT INTO "ingredients" VALUES (81,'trash bag','','',0,'',NULL,0,0,'trash bag',1,0,'',0);
INSERT INTO "ingredients" VALUES (82,'compost bags','','',0,'',NULL,0,0,'compost bag',0,0,'',0);
INSERT INTO "ingredients" VALUES (83,'dish soap','','',0,'',NULL,0,0,'dish soap',0,1,'',0);
INSERT INTO "ingredients" VALUES (85,'parchment','',NULL,0,NULL,NULL,1,0,'parchment',0,1,'',0);
INSERT INTO "ingredients" VALUES (86,'aluminum foil','',NULL,0,'',NULL,1,0,'aluminum foil',0,1,'',0);
INSERT INTO "ingredients" VALUES (87,'waxed paper','',NULL,0,'',NULL,1,0,'waxed paper',0,1,'',0);
INSERT INTO "ingredients" VALUES (88,'paper towels','','',0,'',NULL,0,0,'paper towel',0,1,'',0);
INSERT INTO "ingredients" VALUES (89,'toilet paper','','',0,'',NULL,0,0,'toilet paper',0,1,'',0);
INSERT INTO "ingredients" VALUES (90,'cat litter','','',0,'',NULL,0,0,'cat litter',0,1,'',0);
INSERT INTO "ingredients" VALUES (91,'tea','',NULL,0,'',NULL,1,0,'tea',0,1,'',0);
INSERT INTO "ingredients" VALUES (92,'pasta','',NULL,0,NULL,NULL,1,0,'pasta',0,1,'',0);
INSERT INTO "ingredients" VALUES (93,'marinara sauce','Rao’s',NULL,0,NULL,NULL,1,0,'marinara sauce',0,1,'',0);
INSERT INTO "ingredients" VALUES (94,'olive oil','extra-virgin',NULL,0,NULL,NULL,1,0,'olive oil',0,1,'',0);
INSERT INTO "ingredients" VALUES (96,'beans','',NULL,0,NULL,NULL,1,0,'bean',1,1,'',0);
INSERT INTO "ingredients" VALUES (97,'rice','',NULL,0,NULL,NULL,1,0,'rice',0,1,'',0);
INSERT INTO "ingredients" VALUES (99,'bread','Dave’s Killer thin-sliced',NULL,0,'',NULL,1,0,'bread',0,0,'',0);
INSERT INTO "ingredients" VALUES (100,'bagel','',NULL,0,'',NULL,1,0,'bagel',1,0,'',0);
INSERT INTO "ingredients" VALUES (101,'bun','',NULL,0,'',NULL,1,0,'bun',1,0,'buns',0);
INSERT INTO "ingredients" VALUES (102,'tortilla chips','',NULL,0,NULL,NULL,1,0,'tortilla chip',1,1,'',0);
INSERT INTO "ingredients" VALUES (103,'cracker','',NULL,0,NULL,NULL,1,0,'cracker',1,0,'',0);
INSERT INTO "ingredients" VALUES (104,'seaweed','',NULL,0,NULL,NULL,1,0,'seaweed',0,1,'',0);
INSERT INTO "ingredients" VALUES (105,'cookie','',NULL,0,NULL,NULL,1,0,'cookie',1,0,'cookies',0);
INSERT INTO "ingredients" VALUES (106,'walnuts','',NULL,0,NULL,NULL,1,0,'walnut',0,0,NULL,0);
INSERT INTO "ingredients" VALUES (107,'pepita','',NULL,0,'',NULL,1,0,'pepita',1,0,'',0);
INSERT INTO "ingredients" VALUES (108,'goji berries','',NULL,0,NULL,NULL,1,0,'goji berry',0,0,NULL,0);
INSERT INTO "ingredients" VALUES (109,'Just Egg','liquid',NULL,0,NULL,NULL,1,0,'Just Egg',0,1,'',0);
INSERT INTO "ingredients" VALUES (110,'hummus','',NULL,0,'large',NULL,1,0,'hummu',0,1,'',0);
INSERT INTO "ingredients" VALUES (111,'salsa','',NULL,0,NULL,NULL,1,0,'salsa',0,1,'',0);
INSERT INTO "ingredients" VALUES (112,'oatmeal','',NULL,0,NULL,NULL,1,0,'oatmeal',0,1,'',0);
INSERT INTO "ingredients" VALUES (113,'granola','',NULL,0,NULL,NULL,1,0,'granola',0,1,'',0);
INSERT INTO "ingredients" VALUES (114,'nutritional yeast',NULL,NULL,0,NULL,NULL,1,0,'nutritional yeast',0,1,'',0);
INSERT INTO "ingredients" VALUES (116,'flour','all-purpose',NULL,0,'',NULL,1,0,'flour',0,1,'',0);
INSERT INTO "ingredients" VALUES (117,'date syrup','',NULL,0,'',NULL,1,0,'date syrup',0,1,'',0);
INSERT INTO "ingredients" VALUES (118,'maple syrup','',NULL,0,NULL,NULL,1,0,'maple syrup',0,1,'',0);
INSERT INTO "ingredients" VALUES (119,'honey','',NULL,0,NULL,NULL,1,0,'honey',0,1,'',0);
INSERT INTO "ingredients" VALUES (120,'jam','',NULL,0,NULL,NULL,1,0,'jam',0,1,'',0);
INSERT INTO "ingredients" VALUES (121,'nocciolata','',NULL,0,NULL,NULL,1,0,'nocciolata',0,1,'',0);
INSERT INTO "ingredients" VALUES (122,'almond butter','',NULL,0,NULL,NULL,1,0,'almond butter',0,1,'',0);
INSERT INTO "ingredients" VALUES (123,'pistachio butter','',NULL,0,NULL,NULL,1,0,'pistachio butter',0,1,NULL,0);
INSERT INTO "ingredients" VALUES (124,'coffee','',NULL,0,NULL,NULL,1,0,'coffee',0,1,NULL,0);
INSERT INTO "ingredients" VALUES (125,'yogurt','',NULL,0,NULL,NULL,1,0,'yogurt',0,1,NULL,0);
INSERT INTO "ingredients" VALUES (128,'butter','',NULL,0,NULL,NULL,1,0,'butter',0,1,'',0);
INSERT INTO "ingredients" VALUES (129,'coconut water','',NULL,0,NULL,NULL,1,0,'coconut water',0,1,NULL,0);
INSERT INTO "ingredients" VALUES (130,'tofu','firm',NULL,0,NULL,NULL,1,0,'tofu',0,1,'',0);
INSERT INTO "ingredients" VALUES (131,'ramen','',NULL,0,NULL,NULL,1,0,'ramen',0,1,NULL,0);
INSERT INTO "ingredients" VALUES (133,'breakfast links','Beyond',NULL,0,'',NULL,1,0,'breakfast link',0,0,'',0);
INSERT INTO "ingredients" VALUES (134,'black pepper',NULL,NULL,0,NULL,NULL,1,0,'black pepper',0,1,'',0);
INSERT INTO "ingredients" VALUES (135,'chuck','Impossible',NULL,0,'',NULL,1,0,'chuck',0,1,'',0);
INSERT INTO "ingredients" VALUES (137,'cashew','raw',NULL,0,NULL,NULL,1,0,'cashew',1,0,'',0);
INSERT INTO "ingredients" VALUES (138,'garlic powder',NULL,NULL,0,NULL,NULL,1,0,'garlic powder',0,1,NULL,0);
INSERT INTO "ingredients" VALUES (139,'basil','dried',NULL,0,NULL,NULL,1,0,'basil',0,1,NULL,0);
INSERT INTO "ingredients" VALUES (140,'oregano','dried',NULL,0,NULL,NULL,1,0,'oregano',0,1,NULL,0);
INSERT INTO "ingredients" VALUES (142,'parmesan','vegan',NULL,0,NULL,NULL,1,0,'parmesan',0,0,NULL,0);
INSERT INTO "ingredients" VALUES (147,'pine nuts',NULL,NULL,0,NULL,NULL,1,0,'pine nut',0,0,NULL,0);
INSERT INTO "ingredients" VALUES (150,'salt',NULL,NULL,0,NULL,NULL,1,0,'salt',0,1,'',0);
INSERT INTO "ingredients" VALUES (153,'baking powder',NULL,NULL,0,NULL,NULL,1,0,'baking powder',0,1,NULL,0);
INSERT INTO "ingredients" VALUES (159,'sesame oil','',NULL,0,'','',1,0,'sesame oil',0,1,'',0);
INSERT INTO "ingredients" VALUES (160,'broth','vegetable',NULL,0,'','',1,0,'broth',0,1,'',0);
INSERT INTO "ingredients" VALUES (161,'lentils','red',NULL,0,'','',1,0,'lentil',0,0,NULL,0);
INSERT INTO "ingredients" VALUES (162,'cumin','ground',NULL,0,'','',1,0,'cumin',0,1,NULL,0);
INSERT INTO "ingredients" VALUES (163,'coriander','ground',NULL,0,'','',1,0,'coriander',0,1,NULL,0);
INSERT INTO "ingredients" VALUES (164,'turmeric','ground',NULL,0,'','',1,0,'turmeric',0,1,NULL,0);
INSERT INTO "ingredients" VALUES (165,'cardamom','ground',NULL,0,'','',1,0,'cardamom',0,1,NULL,0);
INSERT INTO "ingredients" VALUES (166,'cinnamon','ground',NULL,0,'','',1,0,'cinnamon',0,1,NULL,0);
INSERT INTO "ingredients" VALUES (167,'tomato paste','',NULL,0,'','',1,0,'tomato paste',0,1,NULL,0);
INSERT INTO "ingredients" VALUES (209,'tangerines','',NULL,0,'',NULL,1,0,'tangerine',0,0,'',0);
INSERT INTO "ingredients" VALUES (210,'raspberries','',NULL,0,'',NULL,1,0,'raspberry',0,0,'',0);
INSERT INTO "ingredients" VALUES (238,'oat milk','Oatley, barista',NULL,0,'',NULL,1,0,'oat milk',0,1,'',0);
INSERT INTO "ingredients" VALUES (246,'noodles','no-boil lasagna',NULL,0,'',NULL,1,0,'noodle',1,0,'',0);
INSERT INTO "ingredients" VALUES (252,'lemon','fresh',NULL,0,'',NULL,1,0,'lemon',0,0,'',0);
INSERT INTO "ingredients" VALUES (256,'breadcrumbs','',NULL,0,'',NULL,1,0,'breadcrumb',0,0,'',0);
INSERT INTO "ingredients" VALUES (257,'cream cheese','',NULL,0,'',NULL,1,0,'cream cheese',0,0,'',0);
INSERT INTO "ingredients" VALUES (258,'parsley','',NULL,0,'',NULL,1,0,'parsley',0,0,'',0);
INSERT INTO "ingredients" VALUES (259,'mustard','Dijon',NULL,0,'',NULL,1,0,'mustard',0,0,'',0);
INSERT INTO "ingredients" VALUES (260,'Worcestershire sauce','',NULL,0,'',NULL,1,0,'Worcestershire sauce',0,0,'',0);
INSERT INTO "ingredients" VALUES (261,'allspice','ground',NULL,0,'',NULL,1,0,'allspice',0,0,'',0);
INSERT INTO "ingredients" VALUES (262,'nutmeg','ground',NULL,0,'',NULL,1,0,'nutmeg',0,0,'',0);
INSERT INTO "ingredients" VALUES (274,'paprika',NULL,NULL,0,NULL,NULL,1,0,'paprika',0,1,'',0);
INSERT INTO "ingredients" VALUES (275,'bay leaf',NULL,NULL,0,NULL,NULL,1,0,'bay leaf',0,0,'bay leaves',0);
INSERT INTO "ingredients" VALUES (276,'chives',NULL,NULL,0,NULL,NULL,1,0,'chive',1,1,'',0);
INSERT INTO "ingredients" VALUES (277,'baguette',NULL,NULL,0,NULL,NULL,1,0,'baguette',0,0,'',0);
INSERT INTO "ingredients" VALUES (278,'zucchini',NULL,NULL,0,NULL,NULL,1,0,'zucchini',0,0,'',0);
INSERT INTO "ingredients" VALUES (279,'soy sauce',NULL,NULL,0,NULL,NULL,1,0,'soy sauce',0,1,'',0);
INSERT INTO "ingredients" VALUES (280,'steak bites',NULL,NULL,0,NULL,NULL,1,0,'steak bite',0,1,'',0);
INSERT INTO "ingredients" VALUES (281,'onion powder',NULL,NULL,0,NULL,NULL,1,0,'onion powder',0,1,'',0);
INSERT INTO "ingredients" VALUES (282,'cilantro',NULL,NULL,0,NULL,NULL,1,0,'cilantro',0,1,'',0);
INSERT INTO "ingredients" VALUES (285,'jalapeño',NULL,NULL,0,NULL,NULL,1,0,'jalapeño',0,0,'',0);
INSERT INTO "ingredients" VALUES (286,'lime',NULL,NULL,0,NULL,NULL,1,0,'lime',0,0,NULL,0);
INSERT INTO "ingredients" VALUES (287,'wine',NULL,NULL,0,NULL,NULL,1,0,'wine',0,1,'',0);
INSERT INTO "ingredients" VALUES (288,'canned tomato',NULL,NULL,0,NULL,NULL,1,0,'canned tomato',0,0,'',0);
INSERT INTO "ingredients" VALUES (289,'rosemary',NULL,NULL,0,NULL,NULL,1,0,'rosemary',0,1,'',0);
INSERT INTO "ingredients" VALUES (290,'kale',NULL,NULL,0,NULL,NULL,1,0,'kale',0,1,'',0);
INSERT INTO "ingredients" VALUES (291,'spice mix',NULL,NULL,0,NULL,NULL,1,0,'spice mix',0,1,'',0);
INSERT INTO "ingredients" VALUES (292,'furikake',NULL,NULL,0,NULL,NULL,1,0,'furikake',0,0,'',0);
INSERT INTO "ingredients" VALUES (293,'sesame seeds',NULL,NULL,0,NULL,NULL,1,0,'sesame seed',1,1,'',0);
INSERT INTO "ingredients" VALUES (294,'ginger',NULL,NULL,0,NULL,NULL,1,0,'ginger',0,0,'',0);
INSERT INTO "ingredients" VALUES (295,'wasabi paste',NULL,NULL,0,NULL,NULL,1,0,'wasabi paste',0,0,'',0);
INSERT INTO "ingredients" VALUES (296,'blackberries',NULL,NULL,0,NULL,NULL,1,0,'blackberry',0,0,'',0);
INSERT INTO "ingredients" VALUES (297,'date',NULL,NULL,0,NULL,NULL,1,0,'date',1,0,'',0);
INSERT INTO "ingredients" VALUES (298,'grapes',NULL,NULL,0,NULL,NULL,1,0,'grape',0,0,'',0);
INSERT INTO "ingredients" VALUES (299,'mango',NULL,NULL,0,NULL,NULL,1,0,'mango',0,0,'',0);
INSERT INTO "ingredients" VALUES (300,'pineapple',NULL,NULL,0,NULL,NULL,1,0,'pineapple',0,0,'',0);
INSERT INTO "ingredients" VALUES (301,'cleaner',NULL,NULL,0,NULL,NULL,1,0,'cleaner',0,0,'',0);
INSERT INTO "ingredients" VALUES (302,'cereal',NULL,NULL,0,NULL,NULL,1,0,'cereal',0,0,'',0);
INSERT INTO "ingredients" VALUES (303,'cornstarch',NULL,NULL,0,NULL,NULL,1,0,'cornstarch',0,0,'',0);
INSERT INTO "ingredients" VALUES (304,'macadamia milk',NULL,NULL,0,NULL,NULL,1,0,'macadamia milk',0,0,'',0);
INSERT INTO "ingredients" VALUES (306,'breakfast patties',NULL,NULL,0,NULL,NULL,1,0,'breakfast patty',0,0,'',0);
INSERT INTO "ingredients" VALUES (310,'thyme',NULL,NULL,0,NULL,NULL,1,0,'thyme',0,0,NULL,0);
INSERT INTO "ingredients" VALUES (311,'tortilla',NULL,NULL,0,NULL,NULL,1,0,'tortilla',1,0,'',0);
INSERT INTO "ingredients" VALUES (312,'Ziplock bags',NULL,NULL,0,NULL,NULL,1,0,'Ziplock bag',0,0,'',0);
INSERT INTO "ingredients" VALUES (314,'snack bar',NULL,NULL,0,NULL,NULL,1,0,'snack bar',1,0,'',0);
INSERT INTO "ingredients" VALUES (315,'muesli',NULL,NULL,0,NULL,NULL,1,0,'muesli',0,0,NULL,0);
INSERT INTO "ingredients" VALUES (316,'almonds',NULL,NULL,0,NULL,NULL,1,0,'almond',0,0,'',0);
INSERT INTO "ingredients" VALUES (317,'catsup',NULL,NULL,0,NULL,NULL,1,0,'catsup',0,1,'',0);
INSERT INTO "ingredients" VALUES (318,'Tater Tots',NULL,NULL,0,NULL,NULL,1,0,'Tater Tot',0,0,'',0);
INSERT INTO "ingredients" VALUES (319,'baba ghanoush',NULL,NULL,0,NULL,NULL,1,0,'baba ghanoush',0,1,'',0);
INSERT INTO "ingredients" VALUES (323,'mint',NULL,NULL,0,NULL,NULL,1,0,'mint',0,0,NULL,0);
INSERT INTO "ingredients" VALUES (324,'peanut',NULL,NULL,0,NULL,NULL,1,0,'peanut',0,0,NULL,0);
INSERT INTO "ingredients" VALUES (325,'nut butter',NULL,NULL,0,NULL,NULL,1,0,'nut butter',0,0,NULL,0);
INSERT INTO "ingredients" VALUES (326,'ginger powder',NULL,NULL,0,NULL,NULL,1,0,'ginger powder',0,0,NULL,0);
INSERT INTO "ingredients" VALUES (327,'orange juice',NULL,NULL,0,NULL,NULL,1,0,'orange juice',0,0,'',0);
INSERT INTO "ingredients" VALUES (328,'fenugreek',NULL,NULL,0,NULL,NULL,1,0,'fenugreek',0,0,NULL,0);
INSERT INTO "ingredients" VALUES (329,'clove',NULL,NULL,0,NULL,NULL,1,0,'clove',0,0,'',0);
INSERT INTO "ingredients" VALUES (330,'saffron',NULL,NULL,0,NULL,NULL,1,0,'saffron',0,0,NULL,0);
INSERT INTO "ingredients" VALUES (331,'liquid smoke',NULL,NULL,0,NULL,NULL,1,0,'liquid smoke',0,0,NULL,0);
INSERT INTO "ingredients" VALUES (332,'tempeh',NULL,NULL,0,NULL,NULL,1,0,'tempeh',0,0,NULL,0);
INSERT INTO "ingredients" VALUES (333,'mayonnaise',NULL,NULL,0,NULL,NULL,1,0,'mayonnaise',0,0,'',0);
INSERT INTO "ingredients" VALUES (334,'chickpeas',NULL,NULL,0,NULL,NULL,1,0,'chickpea',0,0,'',0);
INSERT INTO "ingredients" VALUES (335,'capers',NULL,NULL,0,NULL,NULL,1,0,'caper',0,0,'',0);
INSERT INTO "ingredients" VALUES (336,'dill',NULL,NULL,0,NULL,NULL,1,0,'dill',0,0,'',0);
INSERT INTO "ingredients" VALUES (337,'caraway seeds',NULL,NULL,0,NULL,NULL,1,0,'caraway seed',0,0,'',0);
INSERT INTO "ingredients" VALUES (338,'black salt',NULL,NULL,0,NULL,NULL,1,0,'black salt',0,0,'',0);
INSERT INTO "ingredients" VALUES (339,'patty',NULL,NULL,0,NULL,NULL,1,0,'patty',0,0,'',0);
INSERT INTO "ingredients" VALUES (340,'pickle',NULL,NULL,0,NULL,NULL,1,0,'pickle',1,0,'',0);
INSERT INTO "ingredients" VALUES (341,'sausage',NULL,NULL,0,NULL,NULL,1,0,'sausage',0,0,NULL,0);
INSERT INTO "ingredients" VALUES (345,'English muffin',NULL,NULL,0,NULL,NULL,1,0,'English muffin',1,0,'',0);
INSERT INTO "ingredients" VALUES (346,'puff pastry',NULL,NULL,0,NULL,NULL,1,0,'puff pastry',0,0,NULL,0);
INSERT INTO "ingredients" VALUES (347,'asparagus',NULL,NULL,0,NULL,NULL,1,0,'asparagu',0,1,'',0);
INSERT INTO "ingredients" VALUES (348,'sweet potato',NULL,NULL,0,NULL,NULL,1,0,'sweet potato',0,0,NULL,0);
INSERT INTO "ingredients" VALUES (349,'quinoa',NULL,NULL,0,NULL,NULL,1,0,'quinoa',0,0,NULL,0);
INSERT INTO "ingredients" VALUES (350,'hemp heart',NULL,NULL,0,NULL,NULL,1,0,'hemp heart',0,0,NULL,0);
INSERT INTO "ingredients" VALUES (351,'pecan',NULL,NULL,0,NULL,NULL,1,0,'pecan',1,0,'',0);
INSERT INTO "ingredients" VALUES (352,'focaccia',NULL,NULL,0,NULL,NULL,1,0,'focaccia',0,0,NULL,0);
INSERT INTO "ingredients" VALUES (353,'arugula',NULL,NULL,0,NULL,NULL,1,0,'arugula',0,1,'',0);
INSERT INTO "ingredients" VALUES (354,'sour cream',NULL,NULL,0,NULL,NULL,1,0,'sour cream',0,0,NULL,0);
INSERT INTO "ingredients" VALUES (363,'gnocchi',NULL,NULL,0,NULL,NULL,1,0,'gnocchi',0,0,NULL,0);
INSERT INTO "ingredients" VALUES (364,'chick''n strip',NULL,NULL,0,NULL,NULL,1,0,'chick''n strip',1,0,'',0);
INSERT INTO "ingredients" VALUES (366,'Tamari',NULL,NULL,0,NULL,NULL,1,0,'Tamari',0,0,NULL,0);
INSERT INTO "ingredients" VALUES (367,'pineapple juice',NULL,NULL,0,NULL,NULL,1,0,'pineapple juice',0,0,NULL,0);
INSERT INTO "ingredients" VALUES (369,'Teriyaki sauce',NULL,NULL,0,NULL,NULL,1,0,'Teriyaki sauce',0,1,'',1);
INSERT INTO "ingredients" VALUES (370,'bell pepper',NULL,NULL,0,NULL,NULL,1,0,'bell pepper',0,0,NULL,0);
INSERT INTO "ingredients" VALUES (371,'fennel',NULL,NULL,0,NULL,NULL,1,0,'fennel',0,0,NULL,0);
INSERT INTO "ingredients" VALUES (372,'roll',NULL,NULL,0,NULL,NULL,1,0,'roll',1,0,'',0);
INSERT INTO "ingredients" VALUES (373,'bok choy',NULL,NULL,0,NULL,NULL,1,0,'bok choy',0,0,NULL,0);
INSERT INTO "ingredients" VALUES (374,'BBQ sauce',NULL,NULL,0,NULL,NULL,1,0,'BBQ sauce',0,0,NULL,0);
INSERT INTO "ingredients" VALUES (375,'taco shells',NULL,NULL,0,NULL,NULL,1,0,'taco shell',0,0,NULL,0);
INSERT INTO "ingredients" VALUES (376,'hot sauce',NULL,NULL,0,NULL,NULL,1,0,'hot sauce',0,0,NULL,0);
INSERT INTO "ingredients" VALUES (377,'garlic granules',NULL,NULL,0,NULL,NULL,1,0,'garlic granule',0,0,NULL,0);
INSERT INTO "ingredients" VALUES (378,'pretzel stick',NULL,NULL,0,NULL,NULL,1,0,'pretzel stick',1,0,'',0);
INSERT INTO "ingredients" VALUES (379,'waffle',NULL,NULL,0,NULL,NULL,1,0,'waffle',1,0,'',0);
INSERT INTO "ingredients" VALUES (380,'olive',NULL,NULL,0,NULL,NULL,1,0,'olive',1,0,'',0);
INSERT INTO "ingredients" VALUES (382,'cat food',NULL,NULL,0,NULL,NULL,0,0,'cat food',0,0,'',0);
INSERT INTO "recipe_ingredient_headings" VALUES (1,33,NULL,1,'A');
INSERT INTO "recipe_ingredient_headings" VALUES (2,33,NULL,3,'B');
INSERT INTO "recipe_ingredient_headings" VALUES (3,33,NULL,5,'C');
INSERT INTO "recipe_ingredient_headings" VALUES (4,33,NULL,7,'D');
INSERT INTO "recipe_ingredient_headings" VALUES (5,37,NULL,1,'Sauce');
INSERT INTO "recipe_ingredient_headings" VALUES (6,37,NULL,4,'Filling');
INSERT INTO "recipe_ingredient_headings" VALUES (7,42,NULL,1,'FLnoen');
INSERT INTO "recipe_ingredient_headings" VALUES (8,42,NULL,2,'JPBJKB');
INSERT INTO "recipe_ingredient_headings" VALUES (9,42,NULL,3,'JKBLKB');
INSERT INTO "recipe_ingredient_headings" VALUES (10,73,NULL,1,'Meatballs');
INSERT INTO "recipe_ingredient_headings" VALUES (11,73,NULL,14,'Gravy');
INSERT INTO "recipe_ingredient_headings" VALUES (12,85,NULL,12,'Garnishes');
INSERT INTO "recipe_ingredient_headings" VALUES (13,95,NULL,1,'The Business');
INSERT INTO "recipe_ingredient_headings" VALUES (14,97,NULL,13,'Sweet Savory Soy Sauce');
INSERT INTO "recipe_ingredient_headings" VALUES (15,97,NULL,21,'Peanut sauce');
INSERT INTO "recipe_ingredient_headings" VALUES (16,98,NULL,12,'Garnishes');
INSERT INTO "recipe_ingredient_headings" VALUES (17,99,NULL,2,'Tofu');
INSERT INTO "recipe_ingredient_headings" VALUES (18,99,NULL,7,'Veggies');
INSERT INTO "recipe_ingredient_headings" VALUES (19,99,NULL,13,'Curry seasoning (umami)');
INSERT INTO "recipe_ingredient_headings" VALUES (20,99,NULL,22,'Curry seasoning (sweet/fragrant)');
INSERT INTO "recipe_ingredient_headings" VALUES (21,99,NULL,27,'Garnishes');
INSERT INTO "recipe_ingredient_headings" VALUES (22,100,NULL,12,'Condiments');
INSERT INTO "recipe_ingredient_headings" VALUES (23,102,NULL,1,'Salad');
INSERT INTO "recipe_ingredient_headings" VALUES (24,102,NULL,12,'Bread & fixings');
INSERT INTO "recipe_ingredient_headings" VALUES (25,103,NULL,1,'Salad');
INSERT INTO "recipe_ingredient_headings" VALUES (26,103,NULL,10,'Bread & fixings');
INSERT INTO "recipe_ingredient_headings" VALUES (27,117,NULL,2,'Cheese Sauce');
INSERT INTO "recipe_ingredient_headings" VALUES (28,117,NULL,10,'Serve with');
INSERT INTO "recipe_ingredient_headings" VALUES (29,119,NULL,7,'Cream Cheese');
INSERT INTO "recipe_ingredient_headings" VALUES (30,118,NULL,7,'Cream Cheese');
INSERT INTO "recipe_ingredient_headings" VALUES (31,120,NULL,1,'Sweet potatoes');
INSERT INTO "recipe_ingredient_headings" VALUES (32,120,NULL,8,'Quinoa');
INSERT INTO "recipe_ingredient_headings" VALUES (33,120,NULL,11,'Spinach');
INSERT INTO "recipe_ingredient_headings" VALUES (34,120,NULL,16,'Almond Dressing');
INSERT INTO "recipe_ingredient_headings" VALUES (35,120,NULL,21,'Toppings');
INSERT INTO "recipe_ingredient_headings" VALUES (36,139,NULL,2,'Teriyaki Sauce');
INSERT INTO "recipe_ingredient_headings" VALUES (37,139,NULL,11,'Noodles');
INSERT INTO "recipe_ingredient_headings" VALUES (38,139,NULL,13,'Vegetables');
INSERT INTO "recipe_ingredient_headings" VALUES (39,139,NULL,19,'Tofu');
INSERT INTO "recipe_ingredient_headings" VALUES (40,139,NULL,24,'Garnish');
INSERT INTO "recipe_ingredient_headings" VALUES (41,139,NULL,1,'START THIS RECIPE THE NIGHT BEFORE');
INSERT INTO "recipe_ingredient_headings" VALUES (42,140,NULL,12,'Garnish');
INSERT INTO "recipe_ingredient_headings" VALUES (43,141,NULL,1,'Meatballs');
INSERT INTO "recipe_ingredient_headings" VALUES (44,141,NULL,14,'Bread');
INSERT INTO "recipe_ingredient_headings" VALUES (45,142,NULL,13,'Sauce');
INSERT INTO "recipe_ingredient_headings" VALUES (46,142,NULL,21,'BBQ Sauce (alternate)');
INSERT INTO "recipe_ingredient_headings" VALUES (47,143,NULL,10,'Meat');
INSERT INTO "recipe_ingredient_headings" VALUES (48,143,NULL,19,'Pinto Beans');
INSERT INTO "recipe_ingredient_headings" VALUES (49,143,NULL,36,'Cheese Sauce');
INSERT INTO "recipe_ingredient_headings" VALUES (50,143,NULL,27,'Black Beans');
INSERT INTO "recipe_ingredient_map" VALUES (394,73,135,NULL,'1','lb','',0,NULL,2,'',1.0,1.0,0,NULL,'',0,0,NULL,'Impossible','');
INSERT INTO "recipe_ingredient_map" VALUES (395,73,32,NULL,'0.25','','minced',0,NULL,3,'about ¼ cup',0.25,0.25,0,NULL,'',0,0,NULL,'','medium');
INSERT INTO "recipe_ingredient_map" VALUES (396,73,33,NULL,'4','clove','minced',0,NULL,4,'',4.0,4.0,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (397,73,256,NULL,'0.333333333333333','cup','',0,NULL,5,'e.g., Panko',0.333333333333333,0.333333333333333,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (398,73,354,NULL,'2','tbsp','',0,NULL,6,'',2.0,2.0,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (399,73,258,NULL,'2','tbsp','finely chopped',0,NULL,7,'',2.0,2.0,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (400,73,259,NULL,'1','tbsp','',0,NULL,8,'',1.0,1.0,0,NULL,'',0,0,NULL,'Dijon','');
INSERT INTO "recipe_ingredient_map" VALUES (401,73,260,NULL,'1','tbsp','',0,NULL,9,'e.g., Wan Ja Shan',1.0,1.0,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (402,73,261,NULL,'0.5','tsp','',0,NULL,10,'',0.5,0.5,0,NULL,'',0,0,NULL,'ground','');
INSERT INTO "recipe_ingredient_map" VALUES (403,73,262,NULL,'0.5','tsp','',0,NULL,11,'',0.5,0.5,0,NULL,'',0,0,NULL,'ground','');
INSERT INTO "recipe_ingredient_map" VALUES (404,73,134,NULL,'0.25','tsp','',0,NULL,12,'',0.25,0.25,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (405,73,150,NULL,'about 0.5','tsp','',0,NULL,13,'or to taste',0.5,0.5,1,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (406,73,128,NULL,'3','tbsp','',0,NULL,15,'',3.0,3.0,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (407,73,116,NULL,'3','tbsp','',0,NULL,16,'',3.0,3.0,0,NULL,'',0,0,NULL,'all-purpose','');
INSERT INTO "recipe_ingredient_map" VALUES (408,73,160,NULL,'2','cup','',0,NULL,17,'',2.0,2.0,0,NULL,'',0,0,NULL,'No Beef','');
INSERT INTO "recipe_ingredient_map" VALUES (409,73,354,NULL,'0.5','cup','',0,NULL,18,'e.g., Kite Hill',0.5,0.5,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (410,73,260,NULL,'1','tsp','',0,NULL,19,'or more, to taste',1.0,1.0,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (411,73,261,NULL,'0.25','tsp','',0,NULL,20,'',0.25,0.25,0,NULL,'',0,0,NULL,'ground','');
INSERT INTO "recipe_ingredient_map" VALUES (412,73,262,NULL,'0.25','tsp','',0,NULL,21,'',0.25,0.25,0,NULL,'',0,0,NULL,'ground','');
INSERT INTO "recipe_ingredient_map" VALUES (413,73,150,NULL,'','','',0,NULL,22,'to taste',NULL,NULL,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (414,73,134,NULL,'','','',0,NULL,23,'to taste',NULL,NULL,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (417,76,31,NULL,'5','','',0,NULL,1,'',5.0,5.0,0,NULL,'',0,0,NULL,'','medium');
INSERT INTO "recipe_ingredient_map" VALUES (418,76,128,NULL,'0.5','stick','',0,NULL,2,'',0.5,0.5,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (419,76,238,NULL,'0.25','cup','',0,NULL,3,'',0.25,0.25,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (420,76,150,NULL,'0.25 to 0.5','tsp','',0,NULL,4,'',0.25,0.5,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (441,79,137,NULL,'0.5','cup','',0,NULL,1,'',0.5,0.5,0,NULL,'',0,0,'cashews','raw','');
INSERT INTO "recipe_ingredient_map" VALUES (442,79,94,NULL,'1','tbsp','',0,NULL,2,'',1.0,1.0,0,NULL,'',0,0,'olive oil','','');
INSERT INTO "recipe_ingredient_map" VALUES (443,79,32,NULL,'1','','chopped',0,NULL,3,'',1.0,1.0,0,NULL,'',0,0,'onion','','large');
INSERT INTO "recipe_ingredient_map" VALUES (444,79,23,NULL,'2','','chopped',0,NULL,4,'',2.0,2.0,0,NULL,'',0,0,'carrot','','large');
INSERT INTO "recipe_ingredient_map" VALUES (445,79,20,NULL,'2','stalk','chopped',0,NULL,5,'',2.0,2.0,0,NULL,'',0,0,'celery','','');
INSERT INTO "recipe_ingredient_map" VALUES (446,79,33,NULL,'2','clove','minced',0,NULL,6,'',2.0,2.0,0,NULL,'',0,0,'garlic','','');
INSERT INTO "recipe_ingredient_map" VALUES (447,79,25,NULL,'1','head','trimmed and cut into florets',0,NULL,7,'about 1 1/2 lb',1.0,1.0,0,NULL,'',0,0,'cauliflower','','large');
INSERT INTO "recipe_ingredient_map" VALUES (448,79,31,NULL,'4','','peeled and diced',0,NULL,8,'',4.0,4.0,0,NULL,'',0,0,'potato','','large');
INSERT INTO "recipe_ingredient_map" VALUES (449,79,72,NULL,'2','cup','',0,NULL,9,'',2.0,2.0,0,NULL,'',0,0,'corn','frozen','');
INSERT INTO "recipe_ingredient_map" VALUES (450,79,160,NULL,'9','cup','',0,NULL,10,'',9.0,9.0,0,NULL,'',0,0,'broth','No Chicken','');
INSERT INTO "recipe_ingredient_map" VALUES (453,79,274,NULL,'1','tsp','',0,NULL,13,'',1.0,1.0,0,NULL,'',0,0,'paprika','smoked','');
INSERT INTO "recipe_ingredient_map" VALUES (454,79,150,NULL,'0.5','tsp','',0,NULL,14,'or more, to taste',0.5,0.5,0,NULL,'',0,0,'salt','','');
INSERT INTO "recipe_ingredient_map" VALUES (455,79,134,NULL,'0.25','tsp','freshly ground',0,NULL,15,'',0.25,0.25,0,NULL,'',0,0,'black pepper','','');
INSERT INTO "recipe_ingredient_map" VALUES (456,79,275,NULL,'2','','',0,NULL,16,'',2.0,2.0,0,NULL,'',0,0,'bay leaf','','');
INSERT INTO "recipe_ingredient_map" VALUES (457,79,276,NULL,'1','package','minced',0,NULL,17,'',1.0,1.0,0,NULL,'',0,0,'chives','','');
INSERT INTO "recipe_ingredient_map" VALUES (458,79,277,NULL,'1 to 2','','',0,NULL,18,'',1.0,2.0,0,NULL,'',0,0,'baguette','','');
INSERT INTO "recipe_ingredient_map" VALUES (460,79,128,NULL,'','','',0,NULL,19,'',NULL,NULL,0,NULL,'',0,0,'butter','','');
INSERT INTO "recipe_ingredient_map" VALUES (461,81,97,NULL,'3','cup','',0,NULL,1,'',3.0,3.0,0,NULL,'',0,0,NULL,'uncooked','');
INSERT INTO "recipe_ingredient_map" VALUES (462,81,8,NULL,'1.5','tbsp','',0,NULL,2,'',1.5,1.5,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (463,81,32,NULL,'0.5','','in thin quarter moons',0,NULL,3,'',0.5,0.5,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (464,81,23,NULL,'1','','diced',0,NULL,4,'',1.0,1.0,0,NULL,'',0,0,NULL,'','large');
INSERT INTO "recipe_ingredient_map" VALUES (465,81,23,NULL,'2','','diced',0,NULL,5,'',2.0,2.0,0,NULL,'',0,1,NULL,'','small');
INSERT INTO "recipe_ingredient_map" VALUES (466,81,22,NULL,'0.25','','diced',0,NULL,6,'',0.25,0.25,0,NULL,'',0,0,NULL,'purple','large');
INSERT INTO "recipe_ingredient_map" VALUES (467,81,22,NULL,'0.5','','diced',0,NULL,7,'',0.5,0.5,0,NULL,'',0,1,NULL,'purple','small');
INSERT INTO "recipe_ingredient_map" VALUES (468,81,24,NULL,'1','crown','in small florets',0,NULL,8,'',1.0,1.0,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (469,81,34,NULL,'8','oz','sliced',0,NULL,9,'',8.0,8.0,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (470,81,109,NULL,'3','','',0,NULL,10,'toaster warmed and cubed',3.0,3.0,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (471,81,278,NULL,'1','','very thin sliced',0,NULL,11,'',1.0,1.0,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (472,81,21,NULL,'6','','minced',0,NULL,12,'',6.0,6.0,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (474,81,279,NULL,'','','',1,NULL,13,'',NULL,NULL,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (475,85,280,NULL,'1','bag','',0,NULL,1,'',1.0,1.0,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (476,85,97,NULL,'2','cup','uncooked',0,NULL,2,'',2.0,2.0,0,NULL,'',0,0,NULL,'white','');
INSERT INTO "recipe_ingredient_map" VALUES (477,85,96,NULL,'1','can','',0,NULL,3,'',1.0,1.0,0,NULL,'',0,0,NULL,'pinto','');
INSERT INTO "recipe_ingredient_map" VALUES (478,85,9,NULL,'0.25','cup','',0,NULL,4,'',0.25,0.25,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (479,85,160,NULL,'0.5','tsp','',0,NULL,5,'',0.5,0.5,0,NULL,'',0,0,'bullion','no beef','');
INSERT INTO "recipe_ingredient_map" VALUES (480,85,162,NULL,'1','tsp','',0,NULL,6,'',1.0,1.0,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (481,85,274,NULL,'0.5','tsp','',0,NULL,7,'',0.5,0.5,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (482,85,138,NULL,'0.25','tsp','',0,NULL,8,'',0.25,0.25,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (483,85,281,NULL,'0.25','tsp','',0,NULL,9,'',0.25,0.25,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (484,85,279,NULL,'6 to 8','shake','',0,NULL,10,'',6.0,8.0,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (485,85,30,NULL,'2','','diced',0,NULL,13,'',2.0,2.0,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (486,85,29,NULL,'1','','diced',0,NULL,14,'',1.0,1.0,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (487,85,35,NULL,'0.25','head','',0,NULL,16,'',0.25,0.25,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (488,85,282,NULL,'0.25','bunch','',0,NULL,11,'',0.25,0.25,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (489,85,102,NULL,'1','bag','',0,NULL,15,'',1.0,1.0,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (493,85,285,NULL,'0.25','','diced or thinly sliced',1,NULL,17,'',0.25,0.25,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (494,85,286,NULL,'1 to 2','','in wedges',0,NULL,18,'',1.0,2.0,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (496,91,94,NULL,'1','tbsp','',0,NULL,1,'',1.0,1.0,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (497,91,135,NULL,'12','oz','',0,NULL,2,'',12.0,12.0,0,NULL,'',0,0,NULL,'Impossible','');
INSERT INTO "recipe_ingredient_map" VALUES (498,91,23,NULL,'2','','diced',0,NULL,4,'',2.0,2.0,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (499,91,32,NULL,'0.5','','diced',0,NULL,5,'',0.5,0.5,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (500,91,33,NULL,'5','clove','minced',0,NULL,6,'',5.0,5.0,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (501,91,167,NULL,'3','tbsp','',0,NULL,7,'',3.0,3.0,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (502,91,287,NULL,'0.5','cup','',0,NULL,8,'Pinot Grigio',0.5,0.5,0,NULL,'',0,0,NULL,'cooking','');
INSERT INTO "recipe_ingredient_map" VALUES (503,91,160,NULL,'3','cup','',0,NULL,9,'',3.0,3.0,0,NULL,'',0,0,NULL,'No Beef','');
INSERT INTO "recipe_ingredient_map" VALUES (504,91,288,NULL,'1','can','',0,NULL,10,'',1.0,1.0,0,NULL,'',0,0,NULL,'crushed','');
INSERT INTO "recipe_ingredient_map" VALUES (505,91,93,NULL,'1','cup','',0,NULL,11,'',1.0,1.0,0,NULL,'',0,0,NULL,'Rao’s','');
INSERT INTO "recipe_ingredient_map" VALUES (506,91,96,NULL,'2','can','',0,NULL,12,'',2.0,2.0,0,NULL,'',0,0,NULL,'cannellini','');
INSERT INTO "recipe_ingredient_map" VALUES (507,91,275,NULL,'1','','',0,NULL,13,'',1.0,1.0,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (508,91,289,NULL,'1','sprig','',0,NULL,14,'',1.0,1.0,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (509,91,246,NULL,'2','cup','',0,NULL,15,'uncooked',2.0,2.0,0,NULL,'',0,0,NULL,'elbow','');
INSERT INTO "recipe_ingredient_map" VALUES (510,91,290,NULL,'2','handful','de-stemmed',0,NULL,16,'',2.0,2.0,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (511,91,150,NULL,'','','',0,NULL,17,'to taste',NULL,NULL,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (512,91,134,NULL,'','','',0,NULL,18,'to taste',NULL,NULL,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (513,91,252,NULL,'1','','in wedges',1,NULL,19,'',1.0,1.0,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (514,91,291,NULL,'','','',0,NULL,3,'',NULL,NULL,0,NULL,'',0,0,NULL,'Italian','');
INSERT INTO "recipe_ingredient_map" VALUES (515,92,97,NULL,'2','cup','',0,NULL,1,'uncooked',2.0,2.0,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (516,92,104,NULL,'1','package','cut into small ribbons',1,NULL,12,'',1.0,1.0,0,NULL,'',0,0,NULL,'toasted','');
INSERT INTO "recipe_ingredient_map" VALUES (517,92,30,NULL,'2','','diced',0,NULL,2,'',2.0,2.0,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (518,92,26,NULL,'1','cup','diced',0,NULL,3,'',1.0,1.0,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (519,92,130,NULL,'10','oz','cubed',0,NULL,4,'',10.0,10.0,0,NULL,'',0,0,NULL,'extra firm','');
INSERT INTO "recipe_ingredient_map" VALUES (520,92,7,NULL,'1.5','tbsp','',1,NULL,14,'',1.5,1.5,0,NULL,'',0,0,NULL,'rice','');
INSERT INTO "recipe_ingredient_map" VALUES (521,92,74,NULL,'0.75','cup','',0,NULL,5,'',0.75,0.75,0,NULL,'',0,0,NULL,'shelled frozen','');
INSERT INTO "recipe_ingredient_map" VALUES (522,92,279,NULL,'','','',0,NULL,8,'',NULL,NULL,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (523,92,292,NULL,'','','',0,NULL,6,'',NULL,NULL,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (524,92,293,NULL,'','','',0,NULL,7,'',NULL,NULL,0,NULL,'',0,1,NULL,'toasted','');
INSERT INTO "recipe_ingredient_map" VALUES (525,92,294,NULL,'','','',1,NULL,13,'',NULL,NULL,0,NULL,'',0,0,NULL,'pickled','');
INSERT INTO "recipe_ingredient_map" VALUES (526,92,295,NULL,'','','',0,NULL,9,'',NULL,NULL,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (527,92,78,NULL,'7 to 9','','',0,NULL,10,'',7.0,9.0,0,NULL,'',0,0,NULL,'Gardein Ultimate','');
INSERT INTO "recipe_ingredient_map" VALUES (528,92,280,NULL,'','','',1,NULL,11,'',NULL,NULL,0,NULL,'',0,1,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (529,94,116,NULL,'2.25','cup','',0,NULL,1,'',2.25,2.25,0,NULL,'',0,0,NULL,'all-purpose','');
INSERT INTO "recipe_ingredient_map" VALUES (530,94,3,NULL,'3','tbsp','',0,NULL,2,'',3.0,3.0,0,NULL,'',0,0,NULL,'white','');
INSERT INTO "recipe_ingredient_map" VALUES (531,94,153,NULL,'1.5','tbsp','',0,NULL,3,'',1.5,1.5,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (532,94,150,NULL,'0.75','tsp','',0,NULL,4,'',0.75,0.75,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (533,94,238,NULL,'1.5','cup','',0,NULL,5,'',1.5,1.5,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (534,94,9,NULL,'0.5','cup','',0,NULL,6,'',0.5,0.5,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (535,94,7,NULL,'2','tsp','',0,NULL,7,'',2.0,2.0,0,NULL,'',0,0,NULL,'apple cider','');
INSERT INTO "recipe_ingredient_map" VALUES (536,94,8,NULL,'3','tbsp','',0,NULL,8,'',3.0,3.0,0,NULL,'',0,0,NULL,'canola','');
INSERT INTO "recipe_ingredient_map" VALUES (539,97,97,NULL,'3','cup','',0,NULL,1,'',3.0,3.0,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (540,97,280,NULL,'1','bag','',0,NULL,2,'',1.0,1.0,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (541,97,26,NULL,'0.5','','quartered lengthwise then cut into ⅛ inch slices',0,NULL,3,'',0.5,0.5,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (542,97,23,NULL,'2','','shredded',0,NULL,4,'',2.0,2.0,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (543,97,22,NULL,'0.25','','shredded',0,NULL,5,'',0.25,0.25,0,NULL,'',0,0,NULL,'purple','small');
INSERT INTO "recipe_ingredient_map" VALUES (544,97,35,NULL,'8','','chopped',0,NULL,6,'',8.0,8.0,0,NULL,'',0,0,NULL,'butter','');
INSERT INTO "recipe_ingredient_map" VALUES (545,97,21,NULL,'','','',0,NULL,7,'',NULL,NULL,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (546,97,323,NULL,'12','leaf','ribboned',0,NULL,8,'',12.0,12.0,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (547,97,139,NULL,'12','leaf','ribboned',0,NULL,9,'',12.0,12.0,0,NULL,'',0,0,NULL,'Thai','');
INSERT INTO "recipe_ingredient_map" VALUES (548,97,282,NULL,'6','sprig','leaves removed',0,NULL,10,'',6.0,6.0,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (549,97,324,NULL,'1','cup','chopped',0,NULL,11,'',1.0,1.0,0,NULL,'',0,0,NULL,'roasted','');
INSERT INTO "recipe_ingredient_map" VALUES (550,97,286,NULL,'1 to 2','','in wedges',0,NULL,12,'',1.0,2.0,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (551,97,7,NULL,'0.5','cup','',0,NULL,14,'',0.5,0.5,0,NULL,'',0,0,NULL,'rice','');
INSERT INTO "recipe_ingredient_map" VALUES (552,97,9,NULL,'0.25','cup','',0,NULL,15,'',0.25,0.25,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (553,97,118,NULL,'0.25','cup','',0,NULL,16,'',0.25,0.25,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (554,97,279,NULL,'0.25','cup','',0,NULL,17,'',0.25,0.25,0,NULL,'',0,0,NULL,'tamari','');
INSERT INTO "recipe_ingredient_map" VALUES (555,97,33,NULL,'2','clove','minced or grated',0,NULL,18,'',2.0,2.0,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (556,97,294,NULL,'1','knob','minced or grated',0,NULL,19,'',1.0,1.0,0,NULL,'',0,0,NULL,'','small');
INSERT INTO "recipe_ingredient_map" VALUES (557,97,286,NULL,'3','','juiced',0,NULL,20,'',3.0,3.0,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (558,97,159,NULL,'1','tbsp','',0,NULL,22,'',1.0,1.0,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (559,97,325,NULL,'0.25','cup','',0,NULL,23,'',0.25,0.25,0,NULL,'',0,0,NULL,'smooth','');
INSERT INTO "recipe_ingredient_map" VALUES (560,97,238,NULL,'0.25','cup','',0,NULL,24,'',0.25,0.25,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (561,97,160,NULL,'0.25','cup','',0,NULL,25,'',0.25,0.25,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (562,97,7,NULL,'2','tbsp','',0,NULL,26,'',2.0,2.0,0,NULL,'',0,0,NULL,'rice','');
INSERT INTO "recipe_ingredient_map" VALUES (563,97,279,NULL,'1','tbsp','',0,NULL,27,'',1.0,1.0,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (564,97,117,NULL,'1','tsp','',0,NULL,28,'',1.0,1.0,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (565,97,138,NULL,'0.25','tsp','',0,NULL,29,'',0.25,0.25,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (566,97,326,NULL,'0.25','tsp','',0,NULL,30,'',0.25,0.25,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (567,97,327,NULL,'0.25 to 1','cup','',0,NULL,31,'or broth, to dilute to desired consistency',0.25,1.0,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (568,98,280,NULL,'1','bag','',0,NULL,1,'',1.0,1.0,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (569,98,97,NULL,'2','cup','uncooked',0,NULL,2,'',2.0,2.0,0,NULL,'',0,0,NULL,'white','');
INSERT INTO "recipe_ingredient_map" VALUES (570,98,96,NULL,'1','can','',0,NULL,3,'',1.0,1.0,0,NULL,'',0,0,NULL,'pinto','');
INSERT INTO "recipe_ingredient_map" VALUES (571,98,9,NULL,'0.25','cup','',0,NULL,4,'',0.25,0.25,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (572,98,160,NULL,'0.5','tsp','',0,NULL,5,'',0.5,0.5,0,NULL,'',0,0,'bullion','No Beef','');
INSERT INTO "recipe_ingredient_map" VALUES (573,98,162,NULL,'1','tsp','',0,NULL,6,'',1.0,1.0,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (574,98,274,NULL,'0.5','tsp','',0,NULL,7,'',0.5,0.5,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (575,98,138,NULL,'0.25','tsp','',0,NULL,8,'',0.25,0.25,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (576,98,281,NULL,'0.25','tsp','',0,NULL,9,'',0.25,0.25,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (577,98,279,NULL,'6 to 8','shake','',0,NULL,10,'',6.0,8.0,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (578,98,282,NULL,'0.25','bunch','',0,NULL,11,'',0.25,0.25,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (579,98,30,NULL,'2','','diced',0,NULL,13,'',2.0,2.0,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (580,98,29,NULL,'1','','diced',0,NULL,14,'',1.0,1.0,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (581,98,35,NULL,'0.25','head','',0,NULL,15,'',0.25,0.25,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (582,98,285,NULL,'0.25','','diced or thinly sliced',0,NULL,16,'',0.25,0.25,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (583,98,286,NULL,'1 to 2','','in wedges',0,NULL,17,'',1.0,2.0,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (584,99,97,NULL,'3','cup','',0,NULL,1,'uncooked',3.0,3.0,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (585,99,130,NULL,'15','oz','in 1/2 inch cubes',0,NULL,3,'',15.0,15.0,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (586,99,303,NULL,'0.333333333333333','cup','',0,NULL,4,'',0.333333333333333,0.333333333333333,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (587,99,150,NULL,'0.25','tsp','',0,NULL,5,'',0.25,0.25,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (588,99,138,NULL,'0.5','tsp','',0,NULL,6,'',0.5,0.5,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (589,99,23,NULL,'4','','peeled and diced',0,NULL,8,'',4.0,4.0,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (590,99,24,NULL,'1','head','in small florets',0,NULL,9,'',1.0,1.0,0,NULL,'',0,0,NULL,'','large');
INSERT INTO "recipe_ingredient_map" VALUES (591,99,32,NULL,'0.5','','in thin quarter moons',0,NULL,10,'',0.5,0.5,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (592,99,73,NULL,'0.75','cup','',0,NULL,11,'',0.75,0.75,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (593,99,72,NULL,'0.75','cup','',0,NULL,12,'',0.75,0.75,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (594,99,162,NULL,'1.5','tsp','',0,NULL,14,'',1.5,1.5,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (595,99,138,NULL,'1.5','tsp','',0,NULL,15,'',1.5,1.5,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (596,99,163,NULL,'1','tsp','',0,NULL,16,'',1.0,1.0,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (597,99,150,NULL,'1','tsp','',0,NULL,17,'',1.0,1.0,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (598,99,281,NULL,'0.5','tsp','',0,NULL,18,'',0.5,0.5,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (599,99,328,NULL,'0.5','tsp','',0,NULL,19,'',0.5,0.5,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (600,99,274,NULL,'0.25','tsp','',0,NULL,20,'',0.25,0.25,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (601,99,164,NULL,'0.125','tsp','',0,NULL,21,'',0.125,0.125,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (602,99,166,NULL,'2','tsp','',0,NULL,23,'',2.0,2.0,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (603,99,165,NULL,'1','tsp','',0,NULL,24,'',1.0,1.0,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (604,99,329,NULL,'0.25','tsp','',0,NULL,25,'',0.25,0.25,0,NULL,'',0,0,NULL,'ground','');
INSERT INTO "recipe_ingredient_map" VALUES (605,99,262,NULL,'0.25','tsp','',0,NULL,26,'',0.25,0.25,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (606,99,293,NULL,'','','',0,NULL,28,'',NULL,NULL,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (607,99,286,NULL,'','','in wedges',0,NULL,29,'',NULL,NULL,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (608,99,282,NULL,'','','',0,NULL,30,'',NULL,NULL,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (609,99,258,NULL,'','','',0,NULL,31,'minced',NULL,NULL,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (610,99,128,NULL,'','','',0,NULL,32,'',NULL,NULL,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (611,99,330,NULL,'','','',0,NULL,33,'if you''re feelin'' fancy',NULL,NULL,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (612,100,279,NULL,'2','tbsp','',0,NULL,1,'',2.0,2.0,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (613,100,7,NULL,'1','tbsp','',0,NULL,2,'',1.0,1.0,0,NULL,'',0,0,NULL,'rice','');
INSERT INTO "recipe_ingredient_map" VALUES (614,100,317,NULL,'1','tbsp','',0,NULL,3,'',1.0,1.0,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (615,100,138,NULL,'0.5','tsp','',0,NULL,4,'',0.5,0.5,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (616,100,274,NULL,'0.5','tsp','',0,NULL,5,'',0.5,0.5,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (617,100,331,NULL,'0.5','tsp','',0,NULL,6,'',0.5,0.5,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (618,100,332,NULL,'1','package','',0,NULL,7,'',1.0,1.0,0,NULL,'',0,0,NULL,'','8 oz');
INSERT INTO "recipe_ingredient_map" VALUES (619,100,99,NULL,'4','slice','',0,NULL,8,'',4.0,4.0,0,NULL,'',0,0,NULL,'Dave’s Killer thin-sliced','');
INSERT INTO "recipe_ingredient_map" VALUES (620,100,29,NULL,'1','','sliced',0,NULL,9,'',1.0,1.0,0,NULL,'',0,0,NULL,'','large');
INSERT INTO "recipe_ingredient_map" VALUES (621,100,35,NULL,'4','leaf','',0,NULL,10,'',4.0,4.0,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (622,100,30,NULL,'1','','',0,NULL,11,'',1.0,1.0,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (623,100,259,NULL,'','','',0,NULL,13,'',NULL,NULL,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (624,100,333,NULL,'','','',0,NULL,14,'',NULL,NULL,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (625,100,150,NULL,'','','',0,NULL,15,'',NULL,NULL,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (626,100,134,NULL,'','','',0,NULL,16,'',NULL,NULL,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (627,101,246,NULL,'1','package','',0,NULL,1,'3 bricks',1.0,1.0,0,NULL,'',0,0,NULL,'Chinese','');
INSERT INTO "recipe_ingredient_map" VALUES (628,101,24,NULL,'1.5 to 2','cup','in small florets',0,NULL,2,'',1.5,2.0,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (629,101,23,NULL,'2 to 3','','sliced thin',0,NULL,3,'',2.0,3.0,0,NULL,'',0,0,NULL,'','medium');
INSERT INTO "recipe_ingredient_map" VALUES (630,101,130,NULL,'7','oz','',0,NULL,4,'',7.0,7.0,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (631,101,34,NULL,'8','oz','sliced',0,NULL,5,'',8.0,8.0,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (632,101,160,NULL,'3','cup','',0,NULL,6,'',3.0,3.0,0,NULL,'',0,0,NULL,'No Beef','');
INSERT INTO "recipe_ingredient_map" VALUES (633,101,160,NULL,'3','cup','',0,NULL,7,'',3.0,3.0,0,NULL,'',0,0,NULL,'No Chicken','');
INSERT INTO "recipe_ingredient_map" VALUES (634,102,334,NULL,'1','can','',0,NULL,2,'',1.0,1.0,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (635,102,333,NULL,'0.25','cup','',0,NULL,3,'',0.25,0.25,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (636,102,20,NULL,'0.5','cup','diced',0,NULL,4,'',0.5,0.5,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (637,102,335,NULL,'1','tbsp','drained',0,NULL,5,'',1.0,1.0,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (638,102,259,NULL,'0.5','tsp','',0,NULL,6,'',0.5,0.5,0,NULL,'',0,0,NULL,'Dijon','');
INSERT INTO "recipe_ingredient_map" VALUES (639,102,336,NULL,'0.5','tsp','',0,NULL,7,'',0.5,0.5,0,NULL,'',0,0,NULL,'dried','');
INSERT INTO "recipe_ingredient_map" VALUES (640,102,337,NULL,'0.5','tsp','',0,NULL,8,'',0.5,0.5,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (641,102,150,NULL,'0.25','tsp','',0,NULL,9,'',0.25,0.25,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (642,102,292,NULL,'1','tbsp','',0,NULL,10,'',1.0,1.0,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (643,102,134,NULL,'','','',0,NULL,11,'',NULL,NULL,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (644,102,99,NULL,'10 to 12','slice','',0,NULL,13,'',10.0,12.0,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (645,102,29,NULL,'1 to 2','','',0,NULL,14,'',1.0,2.0,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (646,102,35,NULL,'0.333333333333333','head','',0,NULL,15,'',0.333333333333333,0.333333333333333,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (647,102,128,NULL,'','','',0,NULL,16,'',NULL,NULL,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (648,102,333,NULL,'','','',0,NULL,17,'',NULL,NULL,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (649,103,114,NULL,'2','tbsp','',0,NULL,2,'',2.0,2.0,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (650,103,164,NULL,'0.5','tsp','',0,NULL,3,'',0.5,0.5,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (651,103,338,NULL,'0.25','tsp','',0,NULL,4,'',0.25,0.25,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (652,103,274,NULL,'0.25','tsp','',0,NULL,5,'',0.25,0.25,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (653,103,333,NULL,'3','tbsp','',0,NULL,6,'',3.0,3.0,0,NULL,'',0,0,NULL,'Vegenaise','');
INSERT INTO "recipe_ingredient_map" VALUES (654,103,20,NULL,'1','rib','small dice',0,NULL,7,'',1.0,1.0,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (655,103,130,NULL,'7','oz','',0,NULL,8,'',7.0,7.0,0,NULL,'',0,0,NULL,'firm','');
INSERT INTO "recipe_ingredient_map" VALUES (656,103,279,NULL,'2 to 3','shake','',0,NULL,9,'',2.0,3.0,0,NULL,'',0,0,NULL,'shoyu','');
INSERT INTO "recipe_ingredient_map" VALUES (658,103,99,NULL,'10 to 12','slice','',0,NULL,12,'',10.0,12.0,0,NULL,'',0,0,NULL,'Dave’s Killer thin-sliced','');
INSERT INTO "recipe_ingredient_map" VALUES (659,103,29,NULL,'1 to 2','','',0,NULL,13,'',1.0,2.0,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (660,103,35,NULL,'0.333333333333333','head','',0,NULL,14,'',0.333333333333333,0.333333333333333,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (661,103,128,NULL,'','','',0,NULL,15,'',NULL,NULL,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (662,103,333,NULL,'','','',0,NULL,16,'',NULL,NULL,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (663,104,339,NULL,'5','','',0,NULL,1,'',5.0,5.0,0,NULL,'',0,0,NULL,'Impossible','');
INSERT INTO "recipe_ingredient_map" VALUES (664,104,101,NULL,'5','','',0,NULL,2,'',5.0,5.0,0,NULL,'',0,0,NULL,'brioche','');
INSERT INTO "recipe_ingredient_map" VALUES (665,104,35,NULL,'0.333333333333333','head','',0,NULL,3,'',0.333333333333333,0.333333333333333,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (666,104,29,NULL,'1 to 2','','',0,NULL,4,'',1.0,2.0,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (667,104,333,NULL,'','','',0,NULL,5,'',NULL,NULL,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (668,104,317,NULL,'','','',0,NULL,6,'',NULL,NULL,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (669,104,259,NULL,'','','',0,NULL,7,'',NULL,NULL,0,NULL,'',0,0,NULL,'yellow','');
INSERT INTO "recipe_ingredient_map" VALUES (670,104,340,NULL,'','','',0,NULL,8,'',NULL,NULL,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (671,104,32,NULL,'0.25','','thin sliced',0,NULL,9,'',0.25,0.25,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (672,104,318,NULL,'1','bag','',0,NULL,10,'',1.0,1.0,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (673,104,75,NULL,'1','bag','',0,NULL,11,'',1.0,1.0,0,NULL,'',0,1,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (674,105,26,NULL,'1','','thin sliced',0,NULL,1,'',1.0,1.0,0,NULL,'',0,0,NULL,'English','');
INSERT INTO "recipe_ingredient_map" VALUES (675,105,99,NULL,'10','slice','',0,NULL,2,'',10.0,10.0,0,NULL,'',0,0,NULL,'white','');
INSERT INTO "recipe_ingredient_map" VALUES (676,105,142,NULL,'0.5','package','',0,NULL,3,'',0.5,0.5,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (677,105,257,NULL,'','','',0,NULL,4,'',NULL,NULL,0,NULL,'',0,0,NULL,'chive','');
INSERT INTO "recipe_ingredient_map" VALUES (678,105,128,NULL,'','','',0,NULL,5,'',NULL,NULL,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (692,116,94,NULL,'3','tbsp','',0,NULL,1,'',3.0,3.0,0,NULL,'',0,0,NULL,'extra-virgin','');
INSERT INTO "recipe_ingredient_map" VALUES (693,116,32,NULL,'1.5','','diced',0,NULL,2,'',1.5,1.5,0,NULL,'',0,0,NULL,'yellow','small');
INSERT INTO "recipe_ingredient_map" VALUES (694,116,23,NULL,'3','','chopped',0,NULL,3,'',3.0,3.0,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (695,116,20,NULL,'3','rib','',0,NULL,4,'and reduce carrots to 1½',3.0,3.0,0,NULL,'',0,1,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (696,116,24,NULL,'3.5','lb','stems diced & florets separated',0,NULL,5,'',3.5,3.5,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (697,116,134,NULL,'','','freshly ground',0,NULL,6,'',NULL,NULL,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (698,116,31,NULL,'1.5','','peeled & diced',0,NULL,7,'about 1½ cups',1.5,1.5,0,NULL,'',0,0,NULL,'Yukon gold','small');
INSERT INTO "recipe_ingredient_map" VALUES (699,116,33,NULL,'6','clove','minced',0,NULL,8,'',6.0,6.0,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (700,116,160,NULL,'7.5','cup','',0,NULL,9,'',7.5,7.5,0,NULL,'',0,0,NULL,'No Chicken','');
INSERT INTO "recipe_ingredient_map" VALUES (701,116,277,NULL,'3','','cubed',0,NULL,10,'for croutons',3.0,3.0,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (702,116,137,NULL,'0.75','cup','',0,NULL,11,'',0.75,0.75,0,NULL,'',0,0,NULL,'raw','');
INSERT INTO "recipe_ingredient_map" VALUES (703,116,7,NULL,'2.25','tsp','',0,NULL,12,'',2.25,2.25,0,NULL,'',0,0,NULL,'apple cider','');
INSERT INTO "recipe_ingredient_map" VALUES (704,116,259,NULL,'0.75','tsp','',0,NULL,13,'',0.75,0.75,0,NULL,'',0,0,NULL,'Dijon','');
INSERT INTO "recipe_ingredient_map" VALUES (705,116,138,NULL,'0.75','tsp','',0,NULL,14,'',0.75,0.75,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (706,116,114,NULL,'0.5','cup','',0,NULL,15,'',0.5,0.5,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (707,116,252,NULL,'1.5','tbsp','',0,NULL,16,'',1.5,1.5,0,NULL,'',0,0,'lemon juice','','');
INSERT INTO "recipe_ingredient_map" VALUES (708,116,336,NULL,'0.5','cup','',0,NULL,17,'',0.5,0.5,0,NULL,'',0,0,NULL,'fresh','');
INSERT INTO "recipe_ingredient_map" VALUES (709,117,92,NULL,'510','g','',0,NULL,1,'',510.0,510.0,0,NULL,'',0,0,NULL,'elbow','');
INSERT INTO "recipe_ingredient_map" VALUES (710,117,137,NULL,'1.5','cup','soaked in hot water',0,NULL,3,'',1.5,1.5,0,NULL,'',0,0,NULL,'raw','');
INSERT INTO "recipe_ingredient_map" VALUES (711,117,252,NULL,'3','tbsp','',0,NULL,4,'',3.0,3.0,0,NULL,'',0,0,'lemon juice','fresh','');
INSERT INTO "recipe_ingredient_map" VALUES (713,117,114,NULL,'0.5','cup','',0,NULL,6,'',0.5,0.5,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (714,117,138,NULL,'0.5','tsp','',0,NULL,7,'',0.5,0.5,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (715,117,150,NULL,'1.5','tsp','',0,NULL,8,'',1.5,1.5,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (716,117,9,NULL,'1.5','cup','',0,NULL,9,'',1.5,1.5,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (717,117,24,NULL,'1','head','in florets',0,NULL,11,'',1.0,1.0,0,NULL,'',0,0,NULL,'','large');
INSERT INTO "recipe_ingredient_map" VALUES (718,118,346,NULL,'1','package','',0,NULL,1,'2 sheets, defrosted',1.0,1.0,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (719,118,31,NULL,'3','','parboiled',0,NULL,2,'',3.0,3.0,0,NULL,'',0,0,NULL,'Yukon gold','medium');
INSERT INTO "recipe_ingredient_map" VALUES (720,118,257,NULL,'4','oz','',0,NULL,8,'',4.0,4.0,0,NULL,'',0,0,NULL,'chive','');
INSERT INTO "recipe_ingredient_map" VALUES (721,118,125,NULL,'','','',0,NULL,9,'enough for smooth spreading consistency',NULL,NULL,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (722,118,114,NULL,'0.125','cup','',0,NULL,10,'',0.125,0.125,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (723,118,138,NULL,'0.5','tsp','',0,NULL,11,'',0.5,0.5,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (724,118,150,NULL,'0.5','tsp','',0,NULL,12,'',0.5,0.5,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (725,118,94,NULL,'1','tbsp','',0,NULL,6,'',1.0,1.0,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (726,118,347,NULL,'1','bunch','bite-size pieces, ends discarded',0,NULL,3,'',1.0,1.0,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (727,118,32,NULL,'0.25','','thin quarter moons',0,NULL,4,'',0.25,0.25,0,NULL,'',0,0,NULL,'','small');
INSERT INTO "recipe_ingredient_map" VALUES (728,118,289,NULL,'1','tsp','minced',0,NULL,5,'',1.0,1.0,0,NULL,'',0,0,NULL,'fresh','');
INSERT INTO "recipe_ingredient_map" VALUES (729,119,346,NULL,'1','package','',0,NULL,1,'2 sheets defrosted',1.0,1.0,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (730,119,23,NULL,'6','','cut in half lengthwise',0,NULL,2,'',6.0,6.0,0,NULL,'',0,0,NULL,'','medium');
INSERT INTO "recipe_ingredient_map" VALUES (731,119,257,NULL,'4','oz','',0,NULL,8,'',4.0,4.0,0,NULL,'',0,0,NULL,'chive','');
INSERT INTO "recipe_ingredient_map" VALUES (732,119,125,NULL,'','','',0,NULL,9,'enough for smooth spreading consistency',NULL,NULL,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (733,119,114,NULL,'0.125','cup','',0,NULL,10,'',0.125,0.125,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (734,119,138,NULL,'0.5','tsp','',0,NULL,11,'',0.5,0.5,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (735,119,150,NULL,'0.5','tsp','',0,NULL,12,'',0.5,0.5,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (736,119,94,NULL,'1','tbsp','',0,NULL,6,'',1.0,1.0,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (739,119,289,NULL,'1','tsp','minced',0,NULL,5,'',1.0,1.0,0,NULL,'',0,0,NULL,'fresh','');
INSERT INTO "recipe_ingredient_map" VALUES (740,119,119,NULL,'0.5','tbsp','',0,NULL,3,'',0.5,0.5,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (741,119,162,NULL,'1','tsp','',0,NULL,4,'',1.0,1.0,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (742,120,348,NULL,'2','','diced to ½ inch cubes',0,NULL,2,'about 1 lb',2.0,2.0,0,NULL,'',0,0,NULL,'','large');
INSERT INTO "recipe_ingredient_map" VALUES (743,120,94,NULL,'1','tbsp','',0,NULL,3,'',1.0,1.0,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (744,120,274,NULL,'0.5','tsp','',0,NULL,4,'',0.5,0.5,0,NULL,'',0,0,NULL,'smoked','');
INSERT INTO "recipe_ingredient_map" VALUES (745,120,138,NULL,'0.5','tsp','',0,NULL,5,'',0.5,0.5,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (746,120,281,NULL,'0.25','tsp','',0,NULL,6,'',0.25,0.25,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (747,120,150,NULL,'0.125','tsp','',0,NULL,7,'',0.125,0.125,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (748,120,349,NULL,'1.5','cup','',0,NULL,9,'uncooked',1.5,1.5,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (749,120,160,NULL,'1.5','cup','',0,NULL,10,'',1.5,1.5,0,NULL,'',0,0,NULL,'No Chicken','');
INSERT INTO "recipe_ingredient_map" VALUES (750,120,32,NULL,'1','','chopped finely',0,NULL,12,'',1.0,1.0,0,NULL,'',0,0,NULL,'yellow','small');
INSERT INTO "recipe_ingredient_map" VALUES (751,120,36,NULL,'15','oz','',0,NULL,13,'',15.0,15.0,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (752,120,33,NULL,'4','clove','minced',0,NULL,14,'',4.0,4.0,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (753,120,150,NULL,'0.25','tsp','',0,NULL,15,'',0.25,0.25,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (754,120,252,NULL,'6','tbsp','',0,NULL,17,'',6.0,6.0,0,NULL,'',0,0,'lemon juice','','');
INSERT INTO "recipe_ingredient_map" VALUES (755,120,122,NULL,'4','tbsp','',0,NULL,18,'',4.0,4.0,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (756,120,164,NULL,'0.5','tsp','',0,NULL,19,'',0.5,0.5,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (757,120,9,NULL,'4 to 8','tbsp','',0,NULL,20,'',4.0,8.0,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (758,120,350,NULL,'0.5','cup','',0,NULL,22,'',0.5,0.5,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (759,120,282,NULL,'0.25','bunch','',0,NULL,23,'',0.25,0.25,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (760,120,351,NULL,'0.5','cup','roasted',0,NULL,24,'',0.5,0.5,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (761,120,107,NULL,'0.5','cup','roasted',0,NULL,25,'',0.5,0.5,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (762,120,30,NULL,'2','','sliced',0,NULL,26,'',2.0,2.0,0,NULL,'',0,0,NULL,'','large');
INSERT INTO "recipe_ingredient_map" VALUES (763,121,94,NULL,'1','tbsp','',0,NULL,1,'',1.0,1.0,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (764,121,32,NULL,'1','','diced',0,NULL,2,'',1.0,1.0,0,NULL,'',0,0,NULL,'yellow','medium');
INSERT INTO "recipe_ingredient_map" VALUES (765,121,33,NULL,'2','clove','minced',0,NULL,3,'',2.0,2.0,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (766,121,135,NULL,'1','lb','',0,NULL,4,'',1.0,1.0,0,NULL,'',0,0,NULL,'Impossible','');
INSERT INTO "recipe_ingredient_map" VALUES (767,121,274,NULL,'2','tsp','',0,NULL,5,'',2.0,2.0,0,NULL,'',0,0,NULL,'smoked','');
INSERT INTO "recipe_ingredient_map" VALUES (768,121,93,NULL,'2','cup','',0,NULL,6,'',2.0,2.0,0,NULL,'',0,0,NULL,'Rao’s','');
INSERT INTO "recipe_ingredient_map" VALUES (769,121,317,NULL,'2','tbsp','',0,NULL,7,'',2.0,2.0,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (770,121,167,NULL,'','','',0,NULL,8,'equivalent amount',NULL,NULL,0,NULL,'',0,1,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (771,121,259,NULL,'3','tbsp','',0,NULL,9,'',3.0,3.0,0,NULL,'',0,0,NULL,'yellow','');
INSERT INTO "recipe_ingredient_map" VALUES (772,121,118,NULL,'3','tbsp','',0,NULL,10,'',3.0,3.0,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (773,121,150,NULL,'','','',0,NULL,11,'to taste',NULL,NULL,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (774,121,101,NULL,'5','','',0,NULL,12,'',5.0,5.0,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (775,122,352,NULL,'1','package','',0,NULL,1,'',1.0,1.0,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (776,122,353,NULL,'2','oz','',0,NULL,2,'',2.0,2.0,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (777,122,130,NULL,'9','oz','',0,NULL,3,'',9.0,9.0,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (778,122,29,NULL,'1','','',0,NULL,4,'',1.0,1.0,0,NULL,'',0,0,NULL,'','small');
INSERT INTO "recipe_ingredient_map" VALUES (779,122,333,NULL,'0.25','cup','',0,NULL,5,'',0.25,0.25,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (780,122,333,NULL,'1.5','cup','',0,NULL,6,'',1.5,1.5,0,NULL,'',0,0,NULL,'Vegenaise','');
INSERT INTO "recipe_ingredient_map" VALUES (781,123,78,NULL,'2','piece','',0,NULL,1,'',2.0,2.0,0,NULL,'',0,0,NULL,'Gardein Ultimate','');
INSERT INTO "recipe_ingredient_map" VALUES (782,123,333,NULL,'1','tbsp','',0,NULL,2,'',1.0,1.0,0,NULL,'',0,0,NULL,'Vegenaise','');
INSERT INTO "recipe_ingredient_map" VALUES (783,123,29,NULL,'0.5','','',0,NULL,3,'',0.5,0.5,0,NULL,'',0,0,NULL,'','small');
INSERT INTO "recipe_ingredient_map" VALUES (784,123,35,NULL,'','','',0,NULL,4,'',NULL,NULL,0,NULL,'',0,0,NULL,'butter','');
INSERT INTO "recipe_ingredient_map" VALUES (785,123,101,NULL,'1','','',0,NULL,6,'',1.0,1.0,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (786,123,340,NULL,'3','slice','',0,NULL,5,'',3.0,3.0,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (787,124,311,NULL,'1','','',0,NULL,1,'',1.0,1.0,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (788,124,280,NULL,'0.25 to 0.5','cup','',0,NULL,2,'',0.25,0.5,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (789,124,353,NULL,'1','handful','',0,NULL,3,'',1.0,1.0,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (790,124,36,NULL,'1','cup','steamed',0,NULL,4,'',1.0,1.0,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (791,124,30,NULL,'0.25','','sliced',0,NULL,4,'',0.25,0.25,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (792,124,109,NULL,'0.5 to 1','','',0,NULL,5,'',0.5,1.0,0,NULL,'',0,1,NULL,'folded','');
INSERT INTO "recipe_ingredient_map" VALUES (793,125,318,NULL,'0.5','bag','',0,NULL,1,'',0.5,0.5,0,NULL,'',0,0,NULL,'mini','');
INSERT INTO "recipe_ingredient_map" VALUES (794,125,109,NULL,'4','','',0,NULL,2,'',4.0,4.0,0,NULL,'',0,0,NULL,'folded','');
INSERT INTO "recipe_ingredient_map" VALUES (795,125,130,NULL,'7','oz','',0,NULL,3,'with eggy spice',7.0,7.0,0,NULL,'',0,1,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (796,125,133,NULL,'6 to 8','','',0,NULL,4,'',6.0,8.0,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (797,125,29,NULL,'1','cup','',0,NULL,5,'',1.0,1.0,0,NULL,'',0,0,NULL,'cherry','');
INSERT INTO "recipe_ingredient_map" VALUES (798,125,36,NULL,'5','oz','',0,NULL,6,'',5.0,5.0,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (808,134,363,NULL,'16','oz','',0,NULL,1,'oil-free',16.0,16.0,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (809,134,32,NULL,'1','','diced',0,NULL,2,'',1.0,1.0,0,NULL,'',0,0,NULL,'white','');
INSERT INTO "recipe_ingredient_map" VALUES (810,134,20,NULL,'3','stalk','diced',0,NULL,3,'',3.0,3.0,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (811,134,34,NULL,'8','oz','sliced',0,NULL,4,'',8.0,8.0,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (812,134,23,NULL,'3','','¼ inch slices',0,NULL,5,'',3.0,3.0,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (813,134,73,NULL,'1','cup','',0,NULL,6,'frozen',1.0,1.0,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (814,134,160,NULL,'4','cup','',0,NULL,7,'',4.0,4.0,0,NULL,'',0,0,NULL,'No Chicken','');
INSERT INTO "recipe_ingredient_map" VALUES (815,134,114,NULL,'0.5','cup','',0,NULL,8,'',0.5,0.5,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (816,134,287,NULL,'0.25','cup','',0,NULL,9,'',0.25,0.25,0,NULL,'',0,0,NULL,'white','');
INSERT INTO "recipe_ingredient_map" VALUES (818,134,310,NULL,'1','tsp','',0,NULL,11,'',1.0,1.0,0,NULL,'',0,0,NULL,'dried','');
INSERT INTO "recipe_ingredient_map" VALUES (819,134,303,NULL,'1','tbsp','',0,NULL,12,'',1.0,1.0,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (821,134,138,NULL,'1','tsp','',0,NULL,14,'',1.0,1.0,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (822,134,364,NULL,'20','','',0,NULL,15,'',20.0,20.0,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (826,139,366,NULL,'0.5','cup','',0,NULL,3,'',0.5,0.5,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (827,139,279,NULL,'0.5','cup','',0,NULL,4,'',0.5,0.5,0,NULL,'',0,1,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (828,139,367,NULL,'0.5','cup','',0,NULL,5,'',0.5,0.5,0,NULL,'',0,0,NULL,'fresh','');
INSERT INTO "recipe_ingredient_map" VALUES (829,139,33,NULL,'2','clove','minced',0,NULL,6,'',2.0,2.0,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (830,139,294,NULL,'1','tbsp','minced',0,NULL,7,'',1.0,1.0,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (831,139,7,NULL,'2','tbsp','',0,NULL,8,'',2.0,2.0,0,NULL,'',0,0,NULL,'rice','');
INSERT INTO "recipe_ingredient_map" VALUES (832,139,303,NULL,'1','tbsp','',0,NULL,9,'',1.0,1.0,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (833,139,293,NULL,'1','tbsp','',0,NULL,10,'',1.0,1.0,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (834,139,246,NULL,'1','package','',0,NULL,12,'',1.0,1.0,0,NULL,'',0,0,NULL,'Chinese','');
INSERT INTO "recipe_ingredient_map" VALUES (835,139,23,NULL,'2','','cut into uniform 1/4 inch pieces',0,NULL,14,'',2.0,2.0,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (836,139,24,NULL,'1','head','cut into florets',0,NULL,15,'',1.0,1.0,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (837,139,21,NULL,'1','bunch','sliced thin',0,NULL,16,'',1.0,1.0,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (838,139,74,NULL,'1','cup','',0,NULL,17,'',1.0,1.0,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (839,139,34,NULL,'8','oz','sliced',0,NULL,18,'',8.0,8.0,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (840,139,130,NULL,'14','oz','cubed',0,NULL,20,'',14.0,14.0,0,NULL,'',0,0,NULL,'extra-firm','');
INSERT INTO "recipe_ingredient_map" VALUES (841,139,369,NULL,'0.25','cup','',0,NULL,21,'see above',0.25,0.25,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (842,139,8,NULL,'0.5','tbsp','',0,NULL,22,'',0.5,0.5,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (843,139,303,NULL,'1','tbsp','',0,NULL,23,'',1.0,1.0,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (844,139,293,NULL,'','','',0,NULL,25,'',NULL,NULL,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (845,139,139,NULL,'','','',0,NULL,26,'',NULL,NULL,0,NULL,'',0,0,NULL,'Thai','');
INSERT INTO "recipe_ingredient_map" VALUES (846,140,23,NULL,'6','','peeled and coarsely chopped',0,NULL,1,'',6.0,6.0,0,NULL,'',0,0,NULL,'','large');
INSERT INTO "recipe_ingredient_map" VALUES (847,140,33,NULL,'3','clove','minced',0,NULL,2,'',3.0,3.0,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (848,140,20,NULL,'1','cup','chopped',0,NULL,3,'',1.0,1.0,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (849,140,32,NULL,'1','','chopped',0,NULL,4,'',1.0,1.0,0,NULL,'',0,0,NULL,'','small');
INSERT INTO "recipe_ingredient_map" VALUES (850,140,370,NULL,'1','','chopped',0,NULL,5,'',1.0,1.0,0,NULL,'',0,0,NULL,'red','');
INSERT INTO "recipe_ingredient_map" VALUES (851,140,137,NULL,'1','cup','',0,NULL,6,'',1.0,1.0,0,NULL,'',0,0,NULL,'raw','');
INSERT INTO "recipe_ingredient_map" VALUES (852,140,279,NULL,'2','tbsp','',0,NULL,7,'',2.0,2.0,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (853,140,259,NULL,'2','tbsp','',0,NULL,8,'',2.0,2.0,0,NULL,'',0,0,NULL,'Dijon','');
INSERT INTO "recipe_ingredient_map" VALUES (854,140,150,NULL,'1','tsp','',0,NULL,9,'',1.0,1.0,0,NULL,'',0,0,NULL,'sea','');
INSERT INTO "recipe_ingredient_map" VALUES (855,140,134,NULL,'1','tsp','',0,NULL,10,'',1.0,1.0,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (856,140,160,NULL,'6','cup','',0,NULL,11,'',6.0,6.0,0,NULL,'',0,0,NULL,'No Chicken','');
INSERT INTO "recipe_ingredient_map" VALUES (857,140,336,NULL,'0.5','cup','chopped',0,NULL,13,'',0.5,0.5,0,NULL,'',0,0,NULL,'fresh','');
INSERT INTO "recipe_ingredient_map" VALUES (858,140,258,NULL,'0.5','cup','chopped',0,NULL,14,'',0.5,0.5,0,NULL,'',0,0,NULL,'fresh','');
INSERT INTO "recipe_ingredient_map" VALUES (859,140,23,NULL,'1','','shredded',0,NULL,15,'',1.0,1.0,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (860,140,351,NULL,'1','cup','toasted',0,NULL,16,'',1.0,1.0,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (861,140,107,NULL,'1','cup','toasted',0,NULL,17,'',1.0,1.0,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (862,141,135,NULL,'1','lb','',0,NULL,2,'',1.0,1.0,0,NULL,'',0,0,NULL,'Impossible','');
INSERT INTO "recipe_ingredient_map" VALUES (863,141,32,NULL,'0.25','','minced',0,NULL,3,'about ¼ cup',0.25,0.25,0,NULL,'',0,0,NULL,'','medium');
INSERT INTO "recipe_ingredient_map" VALUES (864,141,33,NULL,'4','clove','minced',0,NULL,4,'',4.0,4.0,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (865,141,256,NULL,'0.333333333333333','cup','',0,NULL,5,'',0.333333333333333,0.333333333333333,0,NULL,'',0,0,NULL,'Panko','');
INSERT INTO "recipe_ingredient_map" VALUES (866,141,167,NULL,'2','tbsp','',0,NULL,6,'',2.0,2.0,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (867,141,258,NULL,'2','tbsp','finely chopped',0,NULL,7,'',2.0,2.0,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (868,141,114,NULL,'2','tbsp','',0,NULL,8,'',2.0,2.0,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (869,141,140,NULL,'0.5','tsp','',0,NULL,9,'',0.5,0.5,0,NULL,'',0,0,NULL,'ground','');
INSERT INTO "recipe_ingredient_map" VALUES (870,141,139,NULL,'0.5','tsp','',0,NULL,10,'',0.5,0.5,0,NULL,'',0,0,NULL,'ground','');
INSERT INTO "recipe_ingredient_map" VALUES (871,141,371,NULL,'0.5','tsp','',0,NULL,11,'',0.5,0.5,0,NULL,'',0,0,NULL,'ground','');
INSERT INTO "recipe_ingredient_map" VALUES (872,141,134,NULL,'0.25','tsp','',0,NULL,12,'',0.25,0.25,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (873,141,150,NULL,'0.5','tsp','',0,NULL,13,'or to taste',0.5,0.5,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (874,141,372,NULL,'5','','',0,NULL,15,'e.g., Dutch crunch',5.0,5.0,0,NULL,'',0,0,NULL,'sub','');
INSERT INTO "recipe_ingredient_map" VALUES (875,141,277,NULL,'','','',0,NULL,16,'',NULL,NULL,0,NULL,'',0,1,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (876,142,130,NULL,'7','oz','cubed',0,NULL,1,'',7.0,7.0,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (877,142,280,NULL,'1','bag','',0,NULL,2,'',1.0,1.0,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (878,142,97,NULL,'3','cup','',0,NULL,3,'dry',3.0,3.0,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (879,142,159,NULL,'1 to 2','tbsp','',0,NULL,4,'',1.0,2.0,0,NULL,'',0,0,NULL,'toasted','');
INSERT INTO "recipe_ingredient_map" VALUES (880,142,32,NULL,'1','','in the 1/4 moons',0,NULL,5,'',1.0,1.0,0,NULL,'',0,0,NULL,'','large');
INSERT INTO "recipe_ingredient_map" VALUES (881,142,34,NULL,'20','oz','sliced',0,NULL,6,'',20.0,20.0,0,NULL,'',0,0,NULL,'shiitake','');
INSERT INTO "recipe_ingredient_map" VALUES (882,142,73,NULL,'0.5','cup','',0,NULL,7,'',0.5,0.5,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (883,142,72,NULL,'0.5','cup','',0,NULL,8,'',0.5,0.5,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (884,142,33,NULL,'6','clove','minced',0,NULL,9,'',6.0,6.0,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (885,142,23,NULL,'3','','thin diced',0,NULL,10,'',3.0,3.0,0,NULL,'',0,0,NULL,'','large');
INSERT INTO "recipe_ingredient_map" VALUES (886,142,24,NULL,'6','cup','cut into medium florets',0,NULL,11,'',6.0,6.0,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (887,142,373,NULL,'1','head','chopped',0,NULL,12,'',1.0,1.0,0,NULL,'',0,0,NULL,'','large');
INSERT INTO "recipe_ingredient_map" VALUES (888,142,160,NULL,'1.5','cup','',0,NULL,14,'',1.5,1.5,0,NULL,'',0,0,NULL,'vegetable','');
INSERT INTO "recipe_ingredient_map" VALUES (889,142,279,NULL,'0.5','cup','',0,NULL,15,'',0.5,0.5,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (890,142,303,NULL,'2','tbsp','',0,NULL,16,'',2.0,2.0,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (891,142,118,NULL,'2','tbsp','',0,NULL,17,'',2.0,2.0,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (892,142,159,NULL,'2','tsp','',0,NULL,18,'',2.0,2.0,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (893,142,326,NULL,'0.25','tsp','',0,NULL,19,'',0.25,0.25,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (894,142,138,NULL,'0.5','tsp','',0,NULL,20,'',0.5,0.5,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (895,142,279,NULL,'1.5','tbsp','',0,NULL,22,'',1.5,1.5,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (896,142,374,NULL,'1.5','tbsp','',0,NULL,23,'',1.5,1.5,0,NULL,'',0,0,NULL,'Japanese','');
INSERT INTO "recipe_ingredient_map" VALUES (897,143,375,NULL,'15','','',0,NULL,1,'',15.0,15.0,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (898,143,102,NULL,'','','',0,NULL,2,'',NULL,NULL,0,NULL,'',0,1,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (899,143,97,NULL,'2','cup','',0,NULL,3,'uncooked',2.0,2.0,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (900,143,35,NULL,'','','',0,NULL,4,'',NULL,NULL,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (901,143,29,NULL,'2','','diced',0,NULL,5,'',2.0,2.0,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (902,143,285,NULL,'1','','',0,NULL,6,'',1.0,1.0,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (903,143,30,NULL,'2 to 3','','diced',0,NULL,7,'',2.0,3.0,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (904,143,282,NULL,'','','',0,NULL,8,'',NULL,NULL,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (905,143,376,NULL,'','','',0,NULL,9,'',NULL,NULL,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (906,143,135,NULL,'1','lb','',0,NULL,11,'',1.0,1.0,0,NULL,'',0,0,NULL,'Impossible','');
INSERT INTO "recipe_ingredient_map" VALUES (907,143,162,NULL,'1','tbsp','',0,NULL,12,'',1.0,1.0,0,NULL,'',0,0,NULL,'ground','');
INSERT INTO "recipe_ingredient_map" VALUES (908,143,274,NULL,'1.5','tsp','',0,NULL,13,'',1.5,1.5,0,NULL,'',0,0,NULL,'smoked','');
INSERT INTO "recipe_ingredient_map" VALUES (909,143,163,NULL,'1.5','tsp','',0,NULL,14,'',1.5,1.5,0,NULL,'',0,0,NULL,'ground','');
INSERT INTO "recipe_ingredient_map" VALUES (910,143,150,NULL,'1','tsp','',0,NULL,15,'',1.0,1.0,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (911,143,377,NULL,'0.5','tsp','',0,NULL,16,'',0.5,0.5,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (912,143,3,NULL,'1','pinch','',0,NULL,17,'',1.0,1.0,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (913,143,160,NULL,'0.25','cup','',0,NULL,18,'',0.25,0.25,0,NULL,'',0,0,NULL,'No Beef','');
INSERT INTO "recipe_ingredient_map" VALUES (915,143,96,NULL,'1','can','',0,NULL,28,'',1.0,1.0,0,NULL,'',0,0,NULL,'black','');
INSERT INTO "recipe_ingredient_map" VALUES (922,143,137,NULL,'0.5','cup','',0,NULL,37,'',0.5,0.5,0,NULL,'',0,0,NULL,'raw','');
INSERT INTO "recipe_ingredient_map" VALUES (923,143,252,NULL,'1','tbsp','',0,NULL,38,'',1.0,1.0,0,NULL,'',0,0,'lemon juice','','');
INSERT INTO "recipe_ingredient_map" VALUES (924,143,9,NULL,'0.75','cup','',0,NULL,39,'',0.75,0.75,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (925,143,114,NULL,'0.125','cup','',0,NULL,40,'',0.125,0.125,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (926,143,150,NULL,'0.5','tsp','',0,NULL,41,'or to taste',0.5,0.5,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (927,143,138,NULL,'0.25','tsp','',0,NULL,42,'',0.25,0.25,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (928,143,281,NULL,'0.25','tsp','',0,NULL,43,'',0.25,0.25,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (929,143,274,NULL,'0.125','tsp','',0,NULL,44,'',0.125,0.125,0,NULL,'',0,0,NULL,'smoked','');
INSERT INTO "recipe_ingredient_map" VALUES (930,143,96,NULL,'2','can','',0,NULL,37,'',2.0,2.0,0,NULL,'',0,0,NULL,'pinto','');
INSERT INTO "recipe_ingredient_map" VALUES (931,143,9,NULL,'0.5','cup','',0,NULL,38,'',0.5,0.5,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (932,143,160,NULL,'1','tsp','',0,NULL,39,'',1.0,1.0,0,NULL,'',0,0,'bullion','No Beef','');
INSERT INTO "recipe_ingredient_map" VALUES (933,143,162,NULL,'2','tsp','',0,NULL,40,'',2.0,2.0,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (934,143,274,NULL,'1','tsp','',0,NULL,41,'',1.0,1.0,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (935,143,138,NULL,'0.5','tsp','',0,NULL,42,'',0.5,0.5,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (936,143,281,NULL,'0.5','tsp','',0,NULL,43,'',0.5,0.5,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (937,143,279,NULL,'0.125 to 0.25','cup','',0,NULL,44,'to taste',0.125,0.25,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (938,143,9,NULL,'0.25','cup','',0,NULL,29,'',0.25,0.25,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (939,143,160,NULL,'0.5','tsp','',0,NULL,30,'',0.5,0.5,0,NULL,'',0,0,'bullion','No Beef','');
INSERT INTO "recipe_ingredient_map" VALUES (940,143,162,NULL,'1','tsp','',0,NULL,31,'',1.0,1.0,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (941,143,274,NULL,'0.5','tsp','',0,NULL,32,'',0.5,0.5,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (942,143,138,NULL,'0.25','tsp','',0,NULL,33,'',0.25,0.25,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (943,143,281,NULL,'0.25','tsp','',0,NULL,34,'',0.25,0.25,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (944,143,279,NULL,'6 to 8','shake','',0,NULL,35,'',6.0,8.0,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (945,144,8,NULL,'','','',0,NULL,2,'',NULL,NULL,0,NULL,'',0,0,NULL,'cooking','');
INSERT INTO "recipe_ingredient_map" VALUES (946,144,318,NULL,'0.5 to 1','bag','',0,NULL,1,'',0.5,1.0,0,NULL,'',0,0,NULL,'mini','');
INSERT INTO "recipe_ingredient_map" VALUES (947,144,109,NULL,'3','','',0,NULL,3,'',3.0,3.0,0,NULL,'',0,0,NULL,'folded','');
INSERT INTO "recipe_ingredient_map" VALUES (948,144,32,NULL,'1','','cut into thin quarter moons',0,NULL,4,'',1.0,1.0,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (949,144,133,NULL,'5','','',0,NULL,5,'',5.0,5.0,0,NULL,'',0,0,NULL,'','');
INSERT INTO "recipe_ingredient_map" VALUES (950,144,341,NULL,'1','roll','',0,NULL,6,'',1.0,1.0,0,NULL,'',0,1,NULL,'Impossible','');
INSERT INTO "recipe_ingredient_substitutes" VALUES (2,3,'3',NULL,23,NULL,'medium','chopped');
INSERT INTO "recipe_ingredient_substitutes" VALUES (4,29,NULL,NULL,114,NULL,NULL,NULL);
INSERT INTO "recipe_ingredient_substitutes" VALUES (5,42,'1','tbsp',94,'extra-virgin','','');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1774902395360',79,1,'Heat the olive oil in a large pot over medium heat.','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1774903135659-5',79,2,'Add the onion, carrots, celery, and garlic. Cook, stirring frequently, for 8-10 minutes, or until the carrots are getting soft and the onion is translucent.','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1774903125887-0',79,3,'Add the broth, cauliflower, potatoes, corn, smoked paprika, salt, pepper, and bay leaves to the pot. Bring the mixture to a boil.','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1774903125887-1',79,4,'Reduce the heat to a simmer and cook, covered, for 20 minutes, or until the potatoes and cauliflower are tender, then turn the heat off and remove the bay leaves.','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1774903125887-2',79,5,'Place the cashews into the blender with ⅔ cup water. Blend for 1 minute.','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1774903125887-3',79,6,'Add about ⅓ of the soup to the blender, and purée. Add the purée back to the pot, and stir to combine.','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1774903248222-6',79,7,'Taste the soup and add extra salt and pepper as needed.','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1774903125887-4',79,8,'Bring the soup back to a simmer, and cook, uncovered, for 5 minutes.','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1774903263616-7',79,9,'Serve with chives, baguettes, and butter.','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1774827762432-6',76,1,'Peel potatoes and cut into quarters (or eighths, depending on size).','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1774827864650-7',76,2,'Place in a pot and cover with cold water to about 1/2 inch above the potatoes.','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1774827864650-8',76,3,'Bring to a boil and cook for 10 minutes.','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1774827864650-9',76,4,'Drain the potatoes. Pass them through a ricer into the pot; alternatively, return them to the pot and mash until completely smooth.','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1774827864650-10',76,5,'Add butter, milk, and salt, and mix until thoroughly combined.','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1774827864650-11',76,6,'Adjust salt as needed.','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1775083772255',94,1,'In a large bowl, whisk together the flour, baking powder, salt, and sugar.','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1775083924002-0',94,2,'Pour the milk, water and oil into the bowl with the dry ingredients, and stir with a large spoon until just combined. A few lumps are okay; DO NOT over-mix or your pancakes won''t be as fluffy.','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1775083924002-1',94,3,'Heat a large griddle or pan over medium-high heat and grease with vegan butter.','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1775084001748-2',94,4,'Use about ⅓ cup of batter per pancake. Cook until bubbles form, then flip and cook until golden brown on the other side, about 1-2 minutes.','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1775750400012',97,1,'foo','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1774979741124',85,1,'Air fry the steak bites at 400 degrees F for 10-12 minutes, checking for desired crispness. Set aside in a covered dish to keep warm.','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1775001806450-4',85,2,'Drain and rinse the beans, and add them to a small pot along with the water, bullion, spices, and soy sauce.','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1775001774580-3',85,3,'Mash beans and warm through on medium heat.','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1775001615870-0',85,4,'Cook the rice.','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1775002871625-0',85,5,'Prep garnishes (avocado, tomato, lettuce, cilantro, etc.).','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1775002998609-1',85,6,'Serve with tortilla chips.','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1775751786909',98,1,'Add a step.','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1775752389290',99,1,'Add a step.','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1775753377193',101,1,'Add a step.','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1775004043331',91,1,'Cook the pasta. Drain, toss with oil, and set aside.','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1775064574940-0',91,2,'Dice the onion, carrot, and celery.','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1775064574940-1',91,3,'Season the chuck with salt and Italian spice mix.','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1775064574940-2',91,4,'Brown chuck in oil in a soup pot.','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1775065274155-2',91,5,'Remove from heat once brown and set aside.','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1775064574940-4',91,6,'Add diced veggies and garlic to soup pot and sauté for about 5 minutes over medium heat.','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1775064574940-5',91,7,'Add seasonings and tomato paste, and cook for 2 minutes.','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1775064574940-6',91,8,'Add wine, broth, marinara sauce, crushed tomatoes, beans, bay leaf, and rosemary.','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1775064574940-7',91,9,'Bring to a simmer and add in the kale. Cook until desired tenderness.','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1775064574940-8',91,10,'Remove the rosemary stem and bay leaf.','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1775064574940-9',91,11,'Add the meat back to the pot until warmed through.','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1775064574940-10',91,12,'Serve with pasta.','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1775064574940-12',91,13,'Garnish with lemon, and salt and pepper to taste.','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1775065133336-0',91,14,'Note','heading');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1775065139934-1',91,15,'If there are leftovers, store noodles separately.','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1775752960584',100,1,'Add a step.','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1776296577103',120,1,'Add a step.','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1776297145243',121,1,'Add a step.','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1776297521051',122,1,'Add a step.','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1776297840996',123,1,'Add a step.','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1776298209113',124,1,'Add a step.','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1776298482894',125,1,'Add a step.','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1774805565628-12',73,1,'Meatballs','heading');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1774805577980-13',73,2,'Preheat oven to 400° F','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1774805198100-0',73,3,'In a large bowl, add all of the meatball ingredients and combine.','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1774805354292-9',73,4,'Using a tablespoon measuring spoon (or small cookie scoop), measure out a heaping tablespoon of mixture (about 1.5 tablespoons). Roll each scoop into shape with your hands, and place on a baking sheet lined with a silicon matte.','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1774805423207-10',73,5,'Put cooking sheet in the oven for 20-30 minutes, until golden brown, flipping at the midway mark.','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1774805597237-14',73,6,'Remove from oven.','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1774805599109-15',73,7,'Gravy','heading');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1774805198100-3',73,8,'While the meatballs bake, start making the gravy.','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1774805198100-4',73,9,'Heat butter in a large skillet over medium heat.','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1774805615932-16',73,10,'Whisk in the flour until it''s fully combined, smells slightly nutty, and is lightly golden (about 1 minute). Whisk constantly to prevent burning.','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1774805198100-5',73,11,'Slowly pour in half of the broth while constantly whisking to combine well.','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1774805685566-17',73,12,'Let it come to a simmer before slowly adding the remaining broth. Whisk constantly to prevent lumps. Raise heat slightly if needed.','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1774805198100-6',73,13,'Add the sour cream, Worcestershire sauce, allspice, nutmeg, salt, and pepper.','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1774805733115-18',73,14,'Whisk to combine well. Let it simmer for 7-9 minutes to thicken.','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1774806888723-0',73,15,'Notes','heading');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1774805198100-7',73,16,'Serve over [[recipe:76|Mashed Potatoes]] with lingonberries (often available at Whole Foods).','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1774806895270-1',73,17,'Either mince garlic finely enough to soften and cook properly, or sauté them first if preferred. You can also replace the fresh onion and garlic with 1 teaspoon of granulated garlic and 1 teaspoon of granulated onion.','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1774807032319-3',73,18,'If you can''t find vegan Worcestershire sauce, you can use low-sodium Tamari and a SMALL dash of balsamic or white wine vinegar instead. You may want to reduce the Tamari in the meatball mixture if you use a chuck with higher sodium content.','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1776295826626',119,1,'Add a step.','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1775065755078',92,1,'Cook the rice.','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1775082270306-0',92,2,'Defrost edamame in a small pot of boiling water. Drain and set aside.','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1775082270306-1',92,3,'Cook the chick''n tenders or steak bites.','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1775082270306-2',92,4,'Add rice and toppings to bowls as desired, and garnish with seaweed, furikake, ginger, and wasabi.','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1775755466276',104,1,'Add a step.','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1776294866917',117,1,'Add a step.','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1776295339264',118,1,'Add a step.','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1776728312404',116,1,'Preheat the oven to 400°F and line 2 small baking sheets with silicon mats.','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1776728326340-0',116,2,'Heat the oil in a large stock pot over medium heat.','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1776728378876-7',116,3,'Add the onion, celery (if using), carrots, broccoli stems, salt, and pepper and sauté until softened, about 10 minutes.','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1776728386252-8',116,4,'Add garlic and cook for 1 minute.','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1776728393439-9',116,5,'Add broth and potato and simmer for 20 minutes, until the potatoes are soft.','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1776728326340-1',116,6,'Toss 6–9 cups of the broccoli florets generously with oil and salt, spread out on the mat-lined baking sheet, and roast for 20 minutes, turning halfway through.','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1776728326340-2',116,8,'Steam the remaining florets in a steamer basket, about 4 minutes, and set aside.','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1776728326340-3',116,9,'Toss the bread cubes in oil and salt, spread out on the mat-lined baking sheet, and roast for about 7 minutes.','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1776728326340-4',116,10,'Once the potato is soft, transfer two-thirds of the soup to the blender and add cashews, vinegar, mustard, garlic powder, yeast, and lemon juice and blend until creamy.','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1776728326340-5',116,11,'Pour the purée back into the pot with the remaining soup and add the steamed florets.','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1776728326340-6',116,12,'Serve with croutons, roasted broccoli and fresh dill.','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1774904965717',81,1,'Cook the rice.','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1774977788619-0',81,2,'In a very large skillet, add the oil, onion and carrots, and cook over medium heat until tender crisp (about 3 minutes).','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1774977788619-1',81,3,'Add the cabbage and sauté until crisp tender (about 3 minutes).','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1774977788619-2',81,4,'Add mushrooms and broccoli and cook until veggies are warm and tender crisp.','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1774977788619-3',81,5,'Add the Just Egg and stir to combine.','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1774977788619-4',81,6,'Push the veggies and egg to one side and add the zucchini to the pan in a single layer with a little salt.','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1776728910020-0',81,7,'Cook and flip the zucchini until just warmed through and tender, then stir to combine with the rest.','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1774977788619-5',81,8,'Add butter and salt to the rice.','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1774977788619-6',81,9,'Garnish with soy sauce and green onion.','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1776889621766',141,1,'Meatballs','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1776890118297-0',141,2,'In a large bowl add all of the meatball ingredients and combine.','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1776890119611-1',141,3,'Using a tablespoon measuring spoon (or small cookie scoop), measure out a tablespoon of mixture. Place each scoop on the baking sheet. Once finished, roll each scoop into shape with your hands.','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1776890119611-2',141,4,'Place in the oven for 20-30 minutes until golden brown, flipping at the midway mark. Remove from oven.','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1776890388060',142,1,'Air crisp the steak bites as usual then set aside','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1776891300051-0',142,2,'Cook the rice','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1776891300051-1',142,3,'In a large bowl, combine the ingredients for the stir fry sauce and put the tofu in then and add water to cover it, stir and let soak.','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1776891300051-2',142,4,'Prep all the veggies','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1776891300051-4',142,5,'Cook the onions and mushrooms separately in a little oil and soy sauce','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1776891300051-5',142,6,'Cook the peas & corn separately','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1776891300051-6',142,7,'In our largest skillet, over medium to medium high heat, heat the oil. Add garlic, carrots, and broccoli and veggies are tender-crisp then add the bok choy and cook for another minute then pour the tofu and sauce in turn heat up to high,cp cover and for 3 minutes then remove the lid and continue cooking until the liquid is mostly evaporated and veggies are tender.','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1776891300051-7',142,8,'Serve with optional steak bites, mushrooms and peas over rice.','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1776891414759',143,1,'Cook the rice.','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1776892255425-0',143,2,'Begin cooking the meat in little oil, while it''s getting crumbly and a bit crisped, combine the taco seasonings with the broth and then add that to the pan stir and cook until moisture is evaporated.','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1776892426368-11',143,3,'Beans','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1776892255425-1',143,4,'Drain and rinse the beans.','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1776892448367-12',143,5,'Put each type into its own pot, along with the seasoning ingredients listed above.','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1776892255425-3',143,6,'Pinto beans: Mash and heat through on medium heat.','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1776892255425-5',143,7,'Black beans: Leave whole. Stir and heat through on medium heat.','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1776892363583-10',143,8,'Cheese Sauce','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1776892255425-6',143,9,'Blend the cheese sauce ingredients and put the sauce in a saucepan over medium heat. Whisk constantly, until it begins to bubble and thicken. Add up to a cup of water if desired, depending on how thick or thin you want the sauce to be. Just before serving, whisk the cheese sauce again until smooth, adding water (again) to thin as needed.','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1776892255425-7',143,10,'Assembly','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1776892557689-13',143,11,'Assemble tacos/nachos and garnish with avocado, lettuce, tomato, etc.','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1775754442131',102,1,'Drain and rinse the chickpeas.','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1776896555141-1',102,2,'Add the mayo and slightly mash them together. Use a hand blender and pulse the mixture to the desired texture.','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1776896550744-0',102,3,'Add the rest of the ingredients and stir to combine.','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1775755072771',103,1,'Put sauce ingredients in a bowl and mix.','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1776896647952-1',103,2,'Add celery and crumble the tofu into it.','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1776896655580-2',103,3,'Stir to combine and add shoyu sauce to taste.','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1776896641820-0',103,4,'Serve on toasted bread with lettuce, tomato, and sprouts.','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1776897543630-4',144,1,'Cook the tots using the instructions on the bag.','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1776896822783',144,2,'In a large frying pan, sauté the onion over medium heat for about 5 minutes.','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1776897362581-0',144,3,'Add the sausage to the onions and cook another 5 or 6 minutes. If using links, cut them into rounds as they cook.','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1776897362581-1',144,4,'Toast or steam the eggs, as desired.','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1776897362581-2',144,5,'Cut or shred the eggs and mix them with the sausage and onion.','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1776897362581-3',144,6,'Serve with tots.','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1776888339157',140,1,'Pre-heat the oven to 400°F.','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1776888968070-0',140,2,'In a small bowl or measuring cup, combine Dijon mustard, soy sauce, and seasonings.','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1776888968070-1',140,3,'Put the chopped vegetables in a large bowl with cashews, then pour the sauce over raw vegetables and stir to coat. Pour the coated vegetables into a casserole dish, cover and bake for 1 hour. Remove from the oven, remove the cover and let cool completely.','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1776888968070-2',140,4,'Add cooled roasted vegetables & cashews to a high-speed blender and add 4 cups of the vegetable broth and blend until smooth. (Or blend in small batches of 1 cup roasted vegetables with 1 cup vegetable broth at a time.)','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1776888968070-3',140,5,'Transfer to a soup pot, and add the additional 2 cups of vegetable broth.','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1776888968070-4',140,6,'Heat on medium-low until hot and ready to serve.','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1776888968070-5',140,7,'Garnish with grated carrots, parsley, dill and nuts.','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1776794773712',134,1,'Air fry the chick’n strips.','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1776796640427-0',134,2,'In a large pot, sauté the onions and carrots in a little oil over medium heat until the onion is translucent.','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1776795326711-0',134,3,'In a pan on medium heat with a little oil, cook the celery for 5 minutes and add the mushrooms and cook for a few more minutes until the mushrooms brown.','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1776797005351-1',134,4,'In a small pot with water, cook the peas.','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1776795326711-1',134,5,'Add the white wine to the big pot and cook until the moisture dissipates. Next, add nutritional yeast, thyme, garlic powder, and vegetable broth (minus ½ cup).','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1776795326711-2',134,6,'Use the ½ cup reserved vegetable broth and add the cornstarch and stir until dissolved.','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1776795326711-3',134,7,'Increase the heat to high on the big pot, and bring the mixture to a boil.','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1776795326711-4',134,8,'Add the gnocchi and vegetable broth/cornstarch mixture. Stir to combine.','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1776795473487-9',134,9,'Reduce the temperature to medium-high and continue boiling for 3 minutes.The broth thickens as it heats.','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1776797260914-2',134,10,'Add the cooked chick''n strips to the big pot and stir again, turn off heat and serve - allowing people to add mushroom & celery and/or peas as they like.','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1776888056302-16',139,1,'THE NIGHT BEFORE (marinated tofu)','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1776887685790-2',139,2,'In a small bowl, combine cornstarch with 2 tablespoons of water and form a paste. Set aside.','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1776887685790-3',139,3,'Add ¼ cup water plus all the remaining sauce ingredients in a small saucepan and cook on medium-low until heated through.','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1776887685790-4',139,4,'Add the cornstarch paste, stir into the saucepan, and reduce the temperature to low. The sauce will thicken as it heats.','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1776887685790-5',139,5,'Cut tofu into cubes and marinate overnight in ½ cup of the teriyaki sauce. Store the remaining sauce to use on the veggies and noodles.','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1776887685790-6',139,6,'THE DAY OF','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1776887685790-7',139,7,'Press marinated tofu to remove moisture for 15 at least minutes, then toss with ½ tablespoon of oil and sprinkle with 1 tablespoon of cornstarch then air fry at 400°F 12–18 minutes.','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1776887685790-8',139,8,'Cook the vegetables.','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1776887685790-9',139,9,'In a skillet, saute onions and mushrooms until onions are translucent and mushrooms are browned.','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1776887685790-10',139,10,'In a second pan, with a little oil, cook carrots, broccoli, and edamame for 10 minutes on medium-low.','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1776887685790-11',139,11,'Cook and drain the noodles. Add ¼ cup homemade teriyaki sauce to the noodles and toss to coat. Add additional sauce in small amounts as desired to lightly coat the noodles.','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1776887685790-12',139,12,'Let people add the sauteed vegetables and cooked tofu they want.','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1776887685790-13',139,13,'Sprinkle with sesame seeds and Thai basil leaves for added flavor.','step');
INSERT INTO "recipe_steps" VALUES ('tmp-step-1776887685790-14',139,14,'Drizzle with additional sauce if desired.','step');
INSERT INTO "recipe_tag_map" VALUES (33,79,11,1);
INSERT INTO "recipe_tag_map" VALUES (54,76,10,1);
INSERT INTO "recipe_tag_map" VALUES (97,94,16,1);
INSERT INTO "recipe_tag_map" VALUES (105,97,12,1);
INSERT INTO "recipe_tag_map" VALUES (106,97,17,2);
INSERT INTO "recipe_tag_map" VALUES (107,85,13,1);
INSERT INTO "recipe_tag_map" VALUES (108,98,13,1);
INSERT INTO "recipe_tag_map" VALUES (109,99,18,1);
INSERT INTO "recipe_tag_map" VALUES (110,101,19,1);
INSERT INTO "recipe_tag_map" VALUES (111,101,12,2);
INSERT INTO "recipe_tag_map" VALUES (120,105,20,1);
INSERT INTO "recipe_tag_map" VALUES (124,91,10,1);
INSERT INTO "recipe_tag_map" VALUES (125,91,14,2);
INSERT INTO "recipe_tag_map" VALUES (126,91,15,3);
INSERT INTO "recipe_tag_map" VALUES (128,100,20,1);
INSERT INTO "recipe_tag_map" VALUES (130,73,10,1);
INSERT INTO "recipe_tag_map" VALUES (133,92,12,1);
INSERT INTO "recipe_tag_map" VALUES (135,104,10,1);
INSERT INTO "recipe_tag_map" VALUES (150,116,11,1);
INSERT INTO "recipe_tag_map" VALUES (152,81,12,1);
INSERT INTO "recipe_tag_map" VALUES (155,142,12,1);
INSERT INTO "recipe_tag_map" VALUES (156,142,19,2);
INSERT INTO "recipe_tag_map" VALUES (157,102,20,1);
INSERT INTO "recipe_tag_map" VALUES (159,103,20,1);
INSERT INTO "recipe_tag_map" VALUES (161,144,16,1);
INSERT INTO "recipe_tag_map" VALUES (162,140,11,1);
INSERT INTO "recipes" VALUES (73,'Swedish Meatballs',4,0.5,99);
INSERT INTO "recipes" VALUES (76,'Mashed Potatoes',5,0.5,99);
INSERT INTO "recipes" VALUES (79,'Summer Potato Chowder',6,0.5,99);
INSERT INTO "recipes" VALUES (81,'Rainbow Rice',6,0.5,99);
INSERT INTO "recipes" VALUES (85,'Burrito Bowl',4,0.5,99);
INSERT INTO "recipes" VALUES (91,'Pasta e Fagioli',4,0.5,99);
INSERT INTO "recipes" VALUES (92,'Sushi Bowl',4,0.5,99);
INSERT INTO "recipes" VALUES (94,'Pancakes',4,0.5,99);
INSERT INTO "recipes" VALUES (97,'Vietnamese Rice Bowl',5,0.5,99);
INSERT INTO "recipes" VALUES (98,'Soft Tacos',5,0.5,99);
INSERT INTO "recipes" VALUES (99,'Curry Bowl',5,0.5,99);
INSERT INTO "recipes" VALUES (100,'Tempeh B.L.A.T.',4,0.5,99);
INSERT INTO "recipes" VALUES (101,'Ramen',5,0.5,99);
INSERT INTO "recipes" VALUES (102,'Chickpea Salad Sandwich',5,0.5,99);
INSERT INTO "recipes" VALUES (103,'Devilwich',5,0.5,99);
INSERT INTO "recipes" VALUES (104,'Burgers',5,0.5,99);
INSERT INTO "recipes" VALUES (105,'Cucumber Sandwich',5,0.5,99);
INSERT INTO "recipes" VALUES (116,'Broccoli Soup',8,0.5,99);
INSERT INTO "recipes" VALUES (117,'Mac & Cheese',6,0.5,99);
INSERT INTO "recipes" VALUES (118,'Potato Asparagus Tart',6,0.5,99);
INSERT INTO "recipes" VALUES (119,'Roasted Carrot Tart',6,0.5,99);
INSERT INTO "recipes" VALUES (120,'Sweet Potato Quinoa Bowl',5,0.5,99);
INSERT INTO "recipes" VALUES (121,'Sloppy Joe',5,0.5,99);
INSERT INTO "recipes" VALUES (122,'Tofu Pesto Arugula Sandwich',4,0.5,99);
INSERT INTO "recipes" VALUES (123,'Chick’n Sandwich',1,0.5,99);
INSERT INTO "recipes" VALUES (124,'Breakfast Soft Tacos',1,0.5,99);
INSERT INTO "recipes" VALUES (125,'English Breakfast',4,0.5,99);
INSERT INTO "recipes" VALUES (134,'Chicken and Dumplings',6,0.5,99);
INSERT INTO "recipes" VALUES (139,'Teriyaki Tofu Noodles',6,0.5,99);
INSERT INTO "recipes" VALUES (140,'Carrot Soup',6,0.5,99);
INSERT INTO "recipes" VALUES (141,'Meatball Subs',NULL,0.5,99);
INSERT INTO "recipes" VALUES (142,'Stir Fry',5,0.5,99);
INSERT INTO "recipes" VALUES (143,'Crispy Tacos',5,0.5,99);
INSERT INTO "recipes" VALUES (144,'Hash aux Mini-Tots',4,0.5,99);
INSERT INTO "size_classes" VALUES ('small',1);
INSERT INTO "size_classes" VALUES ('medium',2);
INSERT INTO "size_classes" VALUES ('large',3);
INSERT INTO "size_classes" VALUES ('extra large',4);
INSERT INTO "sizes" VALUES (1,'large',0,3,0);
INSERT INTO "sizes" VALUES (2,'medium',0,4,0);
INSERT INTO "sizes" VALUES (30,'small',0,7,0);
INSERT INTO "store_locations" VALUES (1,1,'produce',NULL,1);
INSERT INTO "store_locations" VALUES (2,1,'health and beauty',NULL,3);
INSERT INTO "store_locations" VALUES (3,1,'frozen food',NULL,4);
INSERT INTO "store_locations" VALUES (4,1,'cleaning products',NULL,5);
INSERT INTO "store_locations" VALUES (5,1,'pasta & grains',NULL,6);
INSERT INTO "store_locations" VALUES (6,1,'bakery',NULL,8);
INSERT INTO "store_locations" VALUES (7,1,'snacks',NULL,7);
INSERT INTO "store_locations" VALUES (8,1,'deli',NULL,9);
INSERT INTO "store_locations" VALUES (9,1,'breakfast, baking, & spices',NULL,10);
INSERT INTO "store_locations" VALUES (11,1,'dairy & vegan',NULL,11);
INSERT INTO "store_locations" VALUES (37,1,'liquor',NULL,2);
INSERT INTO "store_locations" VALUES (38,14,'Nuts & dried fruit',NULL,1);
INSERT INTO "store_locations" VALUES (39,14,'Cheese & deli',NULL,2);
INSERT INTO "store_locations" VALUES (40,14,'Prepared food & dips',NULL,3);
INSERT INTO "store_locations" VALUES (41,14,'Bakery',NULL,4);
INSERT INTO "store_locations" VALUES (42,14,'Chips & cookies',NULL,5);
INSERT INTO "store_locations" VALUES (43,14,'Produce',NULL,6);
INSERT INTO "store_locations" VALUES (44,14,'Oil & spices',NULL,7);
INSERT INTO "store_locations" VALUES (45,14,'Pasta, beans, & rice',NULL,8);
INSERT INTO "store_locations" VALUES (46,14,'Bread & baking',NULL,9);
INSERT INTO "store_locations" VALUES (47,14,'Cereal & snack bars',NULL,10);
INSERT INTO "store_locations" VALUES (48,14,'Paper products & health care',NULL,11);
INSERT INTO "store_locations" VALUES (49,14,'Cleaning products & soda',NULL,12);
INSERT INTO "store_locations" VALUES (50,14,'Vegan & vegetarian',NULL,15);
INSERT INTO "store_locations" VALUES (51,14,'Frozen fruit, entrées, & ice cream',NULL,14);
INSERT INTO "store_locations" VALUES (52,14,'Dairy',NULL,16);
INSERT INTO "store_locations" VALUES (53,14,'Tortillas',NULL,13);
INSERT INTO "store_locations" VALUES (54,14,'Frozen breakfast & vegetables',NULL,17);
INSERT INTO "store_locations" VALUES (55,14,'Fresh juice & butter',NULL,18);
INSERT INTO "store_locations" VALUES (56,14,'Liquor',NULL,19);
INSERT INTO "stores" VALUES (1,'Whole Foods','Ocean Avenue');
INSERT INTO "stores" VALUES (14,'Mollie Stone','');
INSERT INTO "tags" VALUES (10,'comfort food',0,1,'recipes');
INSERT INTO "tags" VALUES (11,'soup',0,2,'recipes');
INSERT INTO "tags" VALUES (12,'Asian',0,3,'recipes');
INSERT INTO "tags" VALUES (13,'Mexican',0,4,'recipes');
INSERT INTO "tags" VALUES (14,'Italian',0,5,'recipes');
INSERT INTO "tags" VALUES (15,'pasta',0,6,'recipes');
INSERT INTO "tags" VALUES (16,'breakfast',0,7,'recipes');
INSERT INTO "tags" VALUES (17,'Vietnamese',0,8,'recipes');
INSERT INTO "tags" VALUES (18,'Indian',0,9,'recipes');
INSERT INTO "tags" VALUES (19,'Chinese',0,10,'recipes');
INSERT INTO "tags" VALUES (20,'sandwiches',0,11,'recipes');
INSERT INTO "tags" VALUES (35,'weekly',0,12,'ingredients');
INSERT INTO "tags" VALUES (37,'monthly',0,13,'ingredients');
INSERT INTO "units" VALUES ('tsp','teaspoon','teaspoons','volume',10,0,0);
INSERT INTO "units" VALUES ('tbsp','tablespoon','tablespoons','volume',11,0,0);
INSERT INTO "units" VALUES ('cup','cup','cups','volume',12,0,0);
INSERT INTO "units" VALUES ('pt','pint','pints','volume',13,0,0);
INSERT INTO "units" VALUES ('qt','quart','quarts','volume',14,0,0);
INSERT INTO "units" VALUES ('gal','gallon','gallons','volume',15,0,0);
INSERT INTO "units" VALUES ('floz','fluid ounce','fluid ounces','volume',16,0,0);
INSERT INTO "units" VALUES ('ml','milliliter','milliliters','volume',20,0,0);
INSERT INTO "units" VALUES ('l','liter','liters','volume',21,0,0);
INSERT INTO "units" VALUES ('g','gram','grams','mass',30,0,0);
INSERT INTO "units" VALUES ('kg','kilogram','kilograms','mass',31,0,0);
INSERT INTO "units" VALUES ('oz','ounce','ounces','mass',32,0,0);
INSERT INTO "units" VALUES ('lb','pound','pounds','mass',33,0,0);
INSERT INTO "units" VALUES ('clove','clove','cloves','count',45,0,0);
INSERT INTO "units" VALUES ('drop','drop','drops','misc',52,0,0);
INSERT INTO "units" VALUES ('stick','stick','','',53,0,0);
INSERT INTO "units" VALUES ('stalk','stalk','','',54,0,0);
INSERT INTO "units" VALUES ('head','head','','',55,0,0);
INSERT INTO "units" VALUES ('package','package','','',56,0,0);
INSERT INTO "units" VALUES ('crown','crown','','',57,0,0);
INSERT INTO "units" VALUES ('bunch','bunch','bunches','',58,0,0);
INSERT INTO "units" VALUES ('bag','bag','','',59,0,0);
INSERT INTO "units" VALUES ('can','can','','',60,0,0);
INSERT INTO "units" VALUES ('shake','shake','','',61,0,0);
INSERT INTO "units" VALUES ('sprig','sprig','','',62,0,0);
INSERT INTO "units" VALUES ('handful','handful','','',63,0,0);
INSERT INTO "units" VALUES ('leaf','leaf','','',64,0,0);
INSERT INTO "units" VALUES ('wedge','wedge','','',65,0,0);
INSERT INTO "units" VALUES ('knob','knob','','',66,0,0);
INSERT INTO "units" VALUES ('slice','slice','','',67,0,0);
INSERT INTO "units" VALUES ('rib','rib','','',68,0,0);
INSERT INTO "units" VALUES ('piece','piece','','',69,0,0);
INSERT INTO "units" VALUES ('pinch','pinch','','',70,0,0);
INSERT INTO "units" VALUES ('roll','roll','','',71,0,0);
CREATE UNIQUE INDEX IF NOT EXISTS "idx_ingredient_sizes_unique" ON "ingredient_sizes" (
	"ingredient_id",
	lower("size")
);
CREATE UNIQUE INDEX IF NOT EXISTS "idx_ingredient_synonyms_synonym" ON "ingredient_synonyms" (
	"synonym" COLLATE NOCASE
);
CREATE INDEX IF NOT EXISTS "idx_ingredient_variant_tag_map_tag" ON "ingredient_variant_tag_map" (
	"tag_id",
	"ingredient_variant_id"
);
CREATE INDEX IF NOT EXISTS "idx_ingredient_variant_tag_map_variant" ON "ingredient_variant_tag_map" (
	"ingredient_variant_id",
	"sort_order",
	"id"
);
CREATE UNIQUE INDEX IF NOT EXISTS "idx_ingredient_variants_one_base_per_ingredient" ON "ingredient_variants" (
	"ingredient_id"
) WHERE trim(lower(COALESCE("variant", ''))) = '';
CREATE UNIQUE INDEX IF NOT EXISTS "idx_ingredient_variants_unique" ON "ingredient_variants" (
	"ingredient_id",
	lower("variant")
);
CREATE UNIQUE INDEX IF NOT EXISTS "idx_ingredients_name_unique" ON "ingredients" (
	lower(trim("name"))
);
CREATE INDEX IF NOT EXISTS "idx_ivsl_store_location" ON "ingredient_variant_store_location" (
	"store_location_id"
);
CREATE INDEX IF NOT EXISTS "idx_ivsl_variant" ON "ingredient_variant_store_location" (
	"ingredient_variant_id"
);
CREATE INDEX IF NOT EXISTS "idx_recipe_tag_map_recipe" ON "recipe_tag_map" (
	"recipe_id",
	"sort_order",
	"id"
);
CREATE INDEX IF NOT EXISTS "idx_recipe_tag_map_tag" ON "recipe_tag_map" (
	"tag_id",
	"recipe_id"
);
CREATE INDEX IF NOT EXISTS "idx_recipes_title_nocase" ON "recipes" (
	"title" COLLATE NOCASE
);
CREATE INDEX IF NOT EXISTS "idx_rih_recipe_section_sort" ON "recipe_ingredient_headings" (
	"recipe_id",
	"section_id",
	"sort_order",
	"ID"
);
CREATE INDEX IF NOT EXISTS "idx_rim_recipe_paren" ON "recipe_ingredient_map" (
	"recipe_id",
	"parenthetical_note"
);
CREATE INDEX IF NOT EXISTS "idx_rim_recipe_section_sort" ON "recipe_ingredient_map" (
	"recipe_id",
	"section_id",
	"sort_order",
	"ID"
);
CREATE UNIQUE INDEX IF NOT EXISTS "idx_sizes_name_nocase" ON "sizes" (
	"name" COLLATE NOCASE
);
CREATE INDEX IF NOT EXISTS "idx_sizes_sort" ON "sizes" (
	"sort_order",
	"name" COLLATE NOCASE
);
CREATE INDEX IF NOT EXISTS "idx_substitutes_recipe_ingredient_id" ON "recipe_ingredient_substitutes" (
	"recipe_ingredient_id"
);
CREATE UNIQUE INDEX IF NOT EXISTS "idx_tags_name_nocase" ON "tags" (
	"name" COLLATE NOCASE
);
CREATE INDEX IF NOT EXISTS "idx_unit_suggestions_hidden_last" ON "unit_suggestions" (
	"is_hidden",
	"last_used_at"
);
CREATE INDEX IF NOT EXISTS "idx_units_sort" ON "units" (
	"sort_order",
	"code" COLLATE NOCASE
);
CREATE TRIGGER trg_block_ingredients_location_at_home_insert
BEFORE INSERT ON ingredients
WHEN trim(lower(COALESCE(NEW.location_at_home, ''))) <> ''
BEGIN
  SELECT RAISE(ABORT, 'location_at_home is deprecated; write ingredient_variants.home_location');
END;
CREATE TRIGGER trg_block_ingredients_location_at_home_update
BEFORE UPDATE OF location_at_home ON ingredients
BEGIN
  SELECT RAISE(ABORT, 'location_at_home is deprecated; write ingredient_variants.home_location');
END;
COMMIT;
