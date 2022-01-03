// ==UserScript==
// @name            Carm DnD Beyond GM Screen
// @namespace       https://github.com/ootz0rz/DNDBeyond-DM-Screen/
// @version         1.0.42
// @description     GM screen for D&DBeyond campaigns
// @author          ootz0rz
// @match           https://www.dndbeyond.com/campaigns/*
// @exclude         /^https://www.dndbeyond.com/campaigns/.*?/.*?$/
// @updateURL       https://github.com/ootz0rz/DNDBeyond-DM-Screen/raw/master/ddb-dm-screen.user.js
// @require         https://ajax.googleapis.com/ajax/libs/jquery/3.5.1/jquery.min.js
// @require         https://media.dndbeyond.com/character-tools/vendors~characterTools.bundle.dec3c041829e401e5940.min.js
// @require         https://www.googletagmanager.com/gtag/js?id=G-XDQBBDCJJV
// @grant           GM_setValue
// @grant           GM_getValue
// @license         MIT; https://github.com/ootz0rz/DNDBeyond-DM-Screen/blob/master/LICENSE
// ==/UserScript==

//---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
//        Script Globals
//---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

const linkUrlTarget = '.ddb-campaigns-character-card-footer-links-item-view';
const linkUrlEdit = '.ddb-campaigns-character-card-footer-links-item-edit';
const campaignElementTarget = '.ddb-campaigns-detail-header-secondary';

const rulesUrls = ["https://character-service.dndbeyond.com/character/v4/rule-data", "https://gamedata-service.dndbeyond.com/vehicles/v3/rule-data"];
const charJSONurlBase = "https://character-service.dndbeyond.com/character/v4/character/";

const stylesheetUrls = [
    "https://raw.githack.com/ootz0rz/DNDBeyond-DM-Screen/master/dm-screen.css"
]

const gameCollectionUrl = {prefix :"https://character-service.dndbeyond.com/character/v4/game-data/", postfix: "/collection"}
const optionalRules = {
    "optionalOrigins": {category:"racial-trait", id:"racialTraitId" },
    "optionalClassFeatures": {category:"class-feature", id:"classFeatureId" },
};

const senseToName = {
    'blindsight': 'bs',
    'darkvision': 'dv',
    'tremorsense': 'ts',
    'truesight': 'true',
    'passive-perception': 'pass-perc',
}

const scriptVarPrefix = "DMScreen-";

const charIDRegex = /\/(\d+).*?$/;
const campaignIDRegex = /\/(\d+)\/*$/;

const FEET_IN_MILES = 5280;
const POUNDS_IN_TON = 2000;
const positiveSign = '+',
    negativeSign = '-';

const autoUpdateDefault = true;
const updateDurationDefault = 60;
const fontSizeDefault = 2;
const displayDeactiveDefault = false;
const displayUnassignedDefault = false;

const fontSizeMap = {
    0: 'font_smallest',
    1: 'font_small',
    2: 'font_normal',
    3: 'font_big',
    4: 'font_biggest',
}

const showAbilitiesDefault = true;
const showSavingThrowsDefault = true;
const showSensesDefault = true;
const showClassesDefault = true;
const showResourcesDefault = true;

const currenciesDefault = {gold : 0};
const currenciesTypeDefault = {
    platinum : { name: 'Platinum', conversion: 10 },
    gold : { name: 'Gold', conversion: 1 },
    electrum : { name: 'Electrum', conversion: 0.5 },
    silver : { name: 'Silver', conversion: 0.1 },
    copper : { name: 'Copper', conversion: 0.01 },
};
const currenciesMainDefault = 'gold';

const HIDE_CLASS = 'hide';
const ACTIVE_ROW_CLASS = 'active_row';
const ACTIVE_ROW_VAR_NAME_PREFIX = '-active_row-';
const DEFAULT_TOOLTIP_PLACEMENT = 'top';
const ACTIVE_FIRST_ROW_CLASS = 'first_row';
const ACTIVE_SECOND_ROW_CLASS = 'second_row';

var $ = window.jQuery;
var rulesData = {},
    charactersData = {},
    campaignID = 0,
    campaignNode = {},
    authHeaders = {},
    editableChars = {};
var mainTable = null;
var colStatsSubTable = null;

// refresh timer
// config
var tockDuration = 1; // in seconds

// state
var refresh_timeSinceLastRefresh = 0;
var refresh_currentTimer = null;
var refresh_autoUpdateNode = null;
var refresh_isTimerActive = false;
var refresh_progressBarContents = null;
var refresh_progressBarCurr = null;
var refresh_progressBarTotal = null;
var refresh_progressBarPct = null;

// string format check
if (!String.prototype.format) {
    String.prototype.format = function () {
        var args = arguments;
        return this.replace(/{(\d+)}/g, function (match, number) {
            return typeof args[number] != 'undefined'
                ? args[number]
                : match;
        });
    };
}

// XXX temp for dev
var my_css = "";
/*
// @resource        IMPORTED_CSS file:///C:/Users/ootz0/Workspace/git/DNDBeyond-DM-Screen/dm-screen.css
// @grant           GM_getResourceText
// @grant           GM_addStyle
*/
if (typeof GM_getResourceText === 'function') {
    my_css = GM_getResourceText("IMPORTED_CSS");
}

// load style sheets
if (my_css.length > 0) {
    GM_addStyle(my_css);
} else {
    stylesheetUrls.forEach(loadStylesheet);
}

//---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
//        HTML Structures
//---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

var mainTableHTML = `
<table class="table primary">
    <thead>
        <tr>
            <th class="col_name" rowspan="2">
                <span class="name">Name</span><br />
                <span class="exhaust"><span>E</span>xhaust</span><br />
                <span class="spellsavedc">Class <span class="lvl">lvl</span>: <span class="dc">DC</span></span>
            </th>
            <th class="col_hp" rowspan="2">
                <span class="overheal">He</span><span class="good">al</span><span class="normal">th</span><span class="hurt"> P</span><span class="bad">ts</span>
                <hr />
                <span class="fail">D</span>eath <span class="save">S</span>aves
            </th>
            <th class="col_ac" rowspan="2">
                <span title="Armor Class">AC</span>
                <hr />
                <div title="Initiative" class="init">Initiative</div>
            </th>
            <th class="col_speed" rowspan="2">
                <span>Sp</span>eed<hr />
                Sens<span>es</span>
            </th>
            <th colspan="7" class="col_stat stat_types b_left b_right">
                <div class="statscore">ability scores</div>
                <div class="bonus">bonus</div>
                <div class="save">save/<span class="prof">prof</span></div>
            </th>
            <th class="col_passives" rowspan="2">
                Passives:<br />
                <span>per</span>cept<br />
                <span>inv</span>est<br />
                <span>ins</span>ight<br />
            </th>
            <th class="col_money" rowspan="2"><span class="pp">$</span><span class="ep">$</span><span class="gp">$</span><span class="sp">$</span><span class="cp">$</span></th>
            <th class="col_skills" rowspan="2"><span class="prof high">Skill Proficiences <span class="value">(+bonus)</span></span></th>
            <th class="col_languages" rowspan="2">Languages</th>
        </tr>
        <tr>
            <th class="col_stat stat_title b_left"></th>
            <th class="col_stat stat_title"><div class="stat">STR</div></th>
            <th class="col_stat stat_title"><div class="stat">DEX</div></th>
            <th class="col_stat stat_title"><div class="stat">CON</div></th>
            <th class="col_stat stat_title"><div class="stat">INT</div></th>
            <th class="col_stat stat_title"><div class="stat">WIS</div></th>
            <th class="col_stat stat_title b_right"><div class="stat">CHA</div></th>
        </tr>
    </thead>
    <tbody id="gm_table_body">
    </tbody>
    <tfoot>
        <tr id="totals">
            <td class="col_name">
                Totals:
            </td>
            <td class="col_hp"></td>
            <td class="col_ac"></td>
            <td class="col_speed"></td>
            <td class="col_stat b_left"></td>
            <td class="col_stat"></td>
            <td class="col_stat"></td>
            <td class="col_stat"></td>
            <td class="col_stat"></td>
            <td class="col_stat"></td>
            <td class="col_stat b_right"></td>
            <td class="col_money" colspan="2">
                <span class="total" role="tooltip" data-microtip-position="{0}" aria-label="Approx Total in GP"></span><hr />
                <span class="ppc"><span class="pp"></span> pp</span>
                <span class="epc"><span class="ep"></span> ep </span>
                <span class="gpc"><span class="gp"></span> gp </span>
                <span class="spc"><span class="sp"></span> sp </span>
                <span class="cpc"><span class="cp"></span> cp </span>
            </td>
            <td class="col_languages" colspan="2"></td>
        </tr>
        <tr>
            <td colspan="15" class='gs-controls'>
                <span class="gs-form-field gs-form-field-number gs-row-container set">
                    <select name="gs-font-size" id="gs-font-size" class='dropdown selectpicker font_size'>
                        <option disabled selected>Font Size</option>
                        <option value='0'>smallest</option>
                        <option value='1'>small</option>
                        <option value='2'>normal</option>
                        <option value='3'>big</option>
                        <option value='4'>biggest</option>
                    </select>
                </span>
                <span class="gs-form-field gs-row-container set">
                    <input class="btn-check" type="checkbox" name="gs-display-deactive" id="gs-display-deactive" value="false">
                    <label class="btn btn-outline-warning" for="gs-display-deactive">Display Deactive</label>
                </span>
                <span class="gs-form-field gs-row-container set">
                    <input class="btn-check" type="checkbox" name="gs-display-unassigned" id="gs-display-unassigned" value="false">
                    <label class="btn btn-outline-warning" for="gs-display-unassigned">Display Un-assigned</label>
                </span>
                <span class="autoupdateset">
                    <span class="set">
                        <span class="">
                            <label for="gs-auto-duration">Duration (sec):</label>
                            <input class="form-control auto_duration" type="number" name="gs-auto-duration" id="gs-auto-duration" value="60" placeholder="secs">
                        </span>
                    </span>
                    <span class="gs-form-field gs-row-container set">
                        <input class="btn-check" type="checkbox" name="gs-auto-update" id="gs-auto-update" value="false">
                        <label class="btn btn-outline-warning" for="gs-auto-update">Auto Update</label>
                    </span>
                </span>
            </td>
        </tr>
        <tr>
            <td colspan="15" class="gs-controls gs-bottom">
                <span class='update'><a role='button' class='btn btn-outline-info' href="https://github.com/ootz0rz/DNDBeyond-DM-Screen/raw/master/ddb-dm-screen.user.js">check for gm screen extension update</a></span>
                <span class='pbarwrap'>
                    <span class='progress-wrapper set'>
                        <span class="text_progress">
                            <span class="curr">100</span>/<span class="total">100</span>s<span class="pct">100%</span>
                        </span>
                        <span class="progress-bar"><span class="progress-bar-fill" style="width: 100%;"></span></span>
                    </span>
                </span>
            </td>
        </tr>
    </tfoot>
</table>
`.format(DEFAULT_TOOLTIP_PLACEMENT);

var tableRowHTML = `
        <tr>
            <td class="col_name">
                <span class="name" role="tooltip" data-microtip-position="right" aria-label="Toggle Detail View"></span><span class="inspiration hide" role="tooltip" data-microtip-position="{0}" aria-label="Inspiration">🎲</span>
                <span class="links"><span role="tooltip" data-microtip-position="{0}" aria-label="Edit"><a href="#" class="edit hide"></a></span><span role="tooltip" data-microtip-position="{0}" aria-label="View"><a href="#" class="view hide"></a></span></span><br/>
                <div class="exhaust"><span></span>- - - - - -</div>
                <div class="spellsavedc"><span></span></div>
                <div class="classes"></div>
                <div class="profbonus"><hr /><span class="pb" role="tooltip" data-microtip-position="right" aria-label="Proficiency Bonus">PB: <span class="pbval">+2</span></span></div>
            </td>
            <td class="col_hp">
                <span class="hurt"></span>
            </td>
            <td class="col_ac">
                <span class="acval" role="tooltip" data-microtip-position="{0}" aria-label="Armor Class"></span>
                <hr />
                <span class="initval" role="tooltip" data-microtip-position="{0}" aria-label="Initiative"></span>
            </td>
            <td class="col_speed"></td>
            <td class="col_stat col_titles b_left">
                <span role="tooltip" data-microtip-position="{0}" aria-label="Ability Score">AS</span><br/>
                <span role="tooltip" data-microtip-position="{0}" aria-label="Bonus">B</span><br/>
                <span role="tooltip" data-microtip-position="{0}" aria-label="Save">S</span></td>
            <td class="col_stat col_str"></td>
            <td class="col_stat col_dex"></td>
            <td class="col_stat col_con"></td>
            <td class="col_stat col_int"></td>
            <td class="col_stat col_wis"></td>
            <td class="col_stat col_cha b_right"></td>
            <td class="col_passives">
                per: <span></span><br />
                inv: <span></span><br />
                ins: <span></span>
            </td>
            <td class="col_money">
                <span class="total" role="tooltip" data-microtip-position="{0}" aria-label="Approx Total in GP"></span><hr />
                <span class="ppc"><span class="pp"></span> pp</span>
                <span class="epc"><span class="ep"></span> ep </span>
                <span class="gpc"><span class="gp"></span> gp </span>
                <span class="spc"><span class="sp"></span> sp </span>
                <span class="cpc"><span class="cp"></span> cp </span>
            </td>
            <td class="col_skills"></td>
            <td class="col_languages"></td>
        </tr>
`.format(DEFAULT_TOOLTIP_PLACEMENT);

var tableSecondRowHTML = `
        <tr id="_details" class="active_row second_row">
            <td class='col_details' colspan="14">
                <table class="table detailstable font_normal secondary">
                    <tbody>
                        <tr>
                            <td class='col_skills' colspan="2"></td>
                        </tr>
                    </tbody>
                </table>
            </td>
        </tr>
`.format(DEFAULT_TOOLTIP_PLACEMENT);

var a = $("<script>", { type: 'text/javascript', src: 'https://www.googletagmanager.com/gtag/js?id=G-XDQBBDCJJV' });
a[0].setAttribute("async", "");
$("body").append(a);

var a2 = `window.dataLayer = window.dataLayer || []; function gtag(){dataLayer.push(arguments);} gtag('js', new Date()); gtag('config', 'G-XDQBBDCJJV');`;
var script = document.createElement('script');
script.innerHTML = a2;
document.body.appendChild(script);
//---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
//        Custom additonal modules to be loaded with D&DBeyond's module loader
//---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

var initalModules = {
    2080: function (module, __webpack_exports__, __webpack_require__) {
        "use strict";
        __webpack_require__.r(__webpack_exports__);
        console.log("Module 2080: start");
        // Unused modules:
        // var react = __webpack_require__(0);
        // var react_default = __webpack_require__.n(react);
        // var react_dom = __webpack_require__(84);
        // var react_dom_default = __webpack_require__.n(react_dom);
        // var es = __webpack_require__(10);
        var dist = __webpack_require__(710);
        var dist_default = __webpack_require__.n(dist);
        var Core = __webpack_require__(5);
        var character_rules_engine_lib_es = __webpack_require__(1);
        var character_rules_engine_web_adapter_es = __webpack_require__(136);

        var crk = "js";
        var ktl = "U";
        var cmov = "ab";

        var key = "";

        for (key in character_rules_engine_lib_es) {
            if (typeof character_rules_engine_lib_es[key].getAbilities === 'function') {
                crk = key;
                console.log("crk found: " + key);
            }
            if (typeof character_rules_engine_lib_es[key].getSenseTypeModifierKey === 'function') {
                ktl = key;
                console.log("ktl found: " + key);
            }
        }

        for (key in Core) {
            if (typeof Core[key].WALK !== 'undefined' && typeof Core[key].SWIM !== 'undefined' && typeof Core[key].CLIMB !== 'undefined' && typeof Core[key].FLY !== 'undefined' && typeof Core[key].BURROW !== 'undefined') {
                cmov = key;
                console.log("cmov found: " + key);
            }
        }

        var charf1 = character_rules_engine_lib_es[crk];
        var charf2 = character_rules_engine_lib_es[ktl];
        var coref1 = character_rules_engine_lib_es[cmov];

        function getAuthHeaders() {
            return dist_default.a.makeGetAuthorizationHeaders({});

        }

        function getCharData(state) {
            /*
                All parts of the following return are from http://media.dndbeyond.com/character-tools/characterTools.bundle.71970e5a4989d91edc1e.min.js, they are found in functions that have: '_mapStateToProps(state)' in the name, like function CharacterManagePane_mapStateToProps(state)
                Any return that uses the function character_rules_engine_lib_es or character_rules_engine_web_adapter_es can be added to this for more return values as this list is not comprehensive.
                Anything with selectors_appEnv is unnessisary,as it just returns values in state.appEnv.
            */
            console.log("Module 2080: Processing State Info Into Data");

            var ruleData = charf1.getRuleData(state);

            function getSenseData(senses) { // finds returns the label
                return Object.keys(senses).map(function (index) {
                    let indexInt = parseInt(index);
                    return {
                        id: indexInt,
                        key: charf2.getSenseTypeModifierKey(indexInt),
                        name: charf2.getSenseTypeLabel(indexInt),
                        distance: senses[indexInt]
                    }
                })
            }

            function getSpeedData(speeds) { // finds returns the label
                let halfSpeed = roundDown(divide(speeds[Core[cmov].WALK], 2));
                return Object.keys(speeds).map(function (index) {
                    let distance = speeds[index];
                    if (Core[cmov].SWIM === index || Core[cmov].CLIMB === index) {
                        // swim speed is essentiall half walking speed rounded down if character doesn't have a set swim speed:
                        // source https://www.dndbeyond.com/sources/basic-rules/adventuring#ClimbingSwimmingandCrawling
                        distance = speeds[index] <= 0 ? halfSpeed : speeds[index];
                    }
                    return {
                        id: charf2.getMovementTypeBySpeedMovementKey(index),
                        key: index,
                        name: charf2.getSpeedMovementKeyLabel(index, ruleData),
                        distance: distance
                    }
                });
            }

            return {
                name: charf1.getName(state),
                avatarUrl: charf1.getAvatarUrl(state),
                spellCasterInfo: charf1.getSpellCasterInfo(state),
                armorClass: charf1.getAcTotal(state),
                initiative: charf1.getProcessedInitiative(state),
                hasInitiativeAdvantage: charf1.getHasInitiativeAdvantage(state),
                resistances: charf1.getActiveGroupedResistances(state),
                immunities: charf1.getActiveGroupedImmunities(state),
                vulnerabilities: charf1.getActiveGroupedVulnerabilities(state),
                conditions: charf1.getActiveConditions(state),
                choiceInfo: charf1.getChoiceInfo(state),
                classes: charf1.getClasses(state),
                feats: charf1.getBaseFeats(state),
                race: charf1.getRace(state),
                currentXp: charf1.getCurrentXp(state),
                preferences: charf1.getCharacterPreferences(state),
                totalClassLevel: charf1.getTotalClassLevel(state),
                spellCasterInfo: charf1.getSpellCasterInfo(state),
                startingClass: charf1.getStartingClass(state),
                background: charf1.getBackgroundInfo(state),
                notes: charf1.getCharacterNotes(state),
                totalWeight: charf1.getTotalWeight(state),
                carryCapacity: charf1.getCarryCapacity(state),
                pushDragLiftWeight: charf1.getPushDragLiftWeight(state),
                encumberedWeight: charf1.getEncumberedWeight(state),
                heavilyEncumberedWeight: charf1.getHeavilyEncumberedWeight(state),
                preferences: charf1.getCharacterPreferences(state),
                currencies: charf1.getCurrencies(state),
                attunedSlots: charf1.getAttunedSlots(state),
                attunableArmor: charf1.getAttunableArmor(state),
                attunableGear: charf1.getAttunableGear(state),
                attunableWeapons: charf1.getAttunableWeapons(state),
                startingClass: charf1.getStartingClass(state),
                background: charf1.getBackgroundInfo(state),
                equipped: {
                    armorItems: charf1.getEquippedArmorItems(state),
                    weaponItems: charf1.getEquippedWeaponItems(state),
                    gearItems: charf1.getEquippedGearItems(state)
                },
                unequipped: {
                    armorItems: charf1.getUnequippedArmorItems(state),
                    weaponItems: charf1.getUnequippedWeaponItems(state),
                    gearItems: charf1.getUnequippedGearItems(state)
                },
                hitPointInfo: charf1.getHitPointInfo(state),
                fails: charf1.getDeathSavesFailCount(state),
                successes: charf1.getDeathSavesSuccessCount(state),
                abilities: charf1.getAbilities(state), // not sure what the difference is between this and abilityLookup, seems to be one is a object, the other an array...
                abilityLookup: charf1.getAbilityLookup(state),
                proficiencyBonus: charf1.getProficiencyBonus(state),
                speeds: getSpeedData(charf1.getCurrentWeightSpeed(state)),
                preferences: charf1.getCharacterPreferences(state),
                inspiration: charf1.getInspiration(state),
                passivePerception: charf1.getPassivePerception(state),
                passiveInvestigation: charf1.getPassiveInvestigation(state),
                passiveInsight: charf1.getPassiveInsight(state),
                senses: getSenseData(charf1.getSenseInfo(state)), //has to be further processed
                skills: charf1.getSkills(state),
                customSkills: charf1.getCustomSkills(state),
                savingThrowDiceAdjustments: charf1.getSavingThrowDiceAdjustments(state),
                situationalBonusSavingThrowsLookup: charf1.getSituationalBonusSavingThrowsLookup(state),
                deathSaveInfo: charf1.getDeathSaveInfo(state),
                proficiencyGroups: charf1.getProficiencyGroups(state),
                background: charf1.getBackgroundInfo(state),
                alignment: charf1.getAlignment(state),
                height: charf1.getHeight(state),
                weight: charf1.getWeight(state),
                size: charf1.getSize(state),
                faith: charf1.getFaith(state),
                skin: charf1.getSkin(state),
                eyes: charf1.getEyes(state),
                hair: charf1.getHair(state),
                age: charf1.getAge(state),
                gender: charf1.getGender(state),
                traits: charf1.getCharacterTraits(state),
                notes: charf1.getCharacterNotes(state),
                levelSpells: charf1.getLevelSpells(state),
                spellCasterInfo: charf1.getSpellCasterInfo(state),
                ruleData: charf1.getRuleData(state),
                xpInfo: charf1.getExperienceInfo(state),
                spellSlots: charf1.getSpellSlots(state),
                pactMagicSlots: charf1.getPactMagicSlots(state),
                attunedSlots: charf1.getAttunedSlots(state),
                hasMaxAttunedItems: charf1.hasMaxAttunedItems(state),
                weaponSpellDamageGroups: charf1.getWeaponSpellDamageGroups(state),
                inventory: charf1.getInventory(state),
                creatures: charf1.getCreatures(state),
                customItems: charf1.getCustomItems(state),
                weight: charf1.getTotalWeight(state),
                weightSpeedType: charf1.getCurrentWeightType(state),
                notes: charf1.getCharacterNotes(state),
                currencies: charf1.getCurrencies(state),
                activatables: charf1.getActivatables(state),
                attacks: charf1.getAttacks(state),
                weaponSpellDamageGroups: charf1.getWeaponSpellDamageGroups(state),
                attacksPerActionInfo: charf1.getAttacksPerActionInfo(state),
                ritualSpells: charf1.getRitualSpells(state),
                spellCasterInfo: charf1.getSpellCasterInfo(state),
                originRefRaceData: charf1.getDataOriginRefRaceData(state),
                hasSpells: charf1.hasSpells(state),
                optionalOrigins: charf1.getOptionalOrigins(state),
            }
        }
        window.moduleExport = {
            getCharData: getCharData,
            getAuthHeaders: getAuthHeaders,
        }
        console.log("Module 2080: end");
    }
};


//---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
//        Main Function
//---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

(function () {
    campaignID = window.location.pathname.match(charIDRegex);
    loadModules(initalModules); //load the module loader which imports from window.jsonpDDBCT and the inputted modules
    findTargets();
    insertElements();
    insertCampaignElements();
    window.moduleExport.getAuthHeaders()().then((function (headers) {
        authHeaders = headers;
        console.log("authHeaders: ", headers);
        retriveRules().then(() => {
            updateAllCharData();
        }).catch((error) => {
            console.log(error);
        });
    }));

    initRefreshTimer();
})();

//---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
//        Functions
//---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------



function findTargets() {
    console.log("Locating Characters from Window");
    $(linkUrlEdit).each((index, value) => {
        var url = value.href;
        var charID = getCharIDFromURL(url);
        if (charID != 0) {
            editableChars[charID] = {
                editurl: url,
            };
        }
    });

    $(linkUrlTarget).each(function (index, value) {
        var url = value.href;
        console.log("Processing view url: " + url);
        var charID = getCharIDFromURL(url);
        if (charID != 0) {
            let node = $(value).parents('li');
            let type = 'unknown';
            let typeNode = $(value).parents('.ddb-campaigns-detail-body-listing');
            if (typeNode.hasClass('ddb-campaigns-detail-body-listing-active')) {
                let unassignedNode = $(value).parents('.ddb-campaigns-detail-body-listing-unassigned-active');
                if (unassignedNode.length > 0) {
                    type = 'unassigned';
                } else {
                    type = 'active';
                }
            } else if (typeNode.hasClass('ddb-campaigns-detail-body-listing-inactive')) {
                type = 'deactivated';
            }
            var editurl = '';
            if (charID in editableChars) {
                editurl = editableChars[charID].editurl;
                console.log("Editable character: ", charID, editurl);
            }

            charactersData[charID] = {
                node: node,
                url: charJSONurlBase + charID,
                viewurl: url,
                editurl: editurl,
                state: {
                    appEnv: {
                        authEndpoint: "https://auth-service.dndbeyond.com/v1/cobalt-token", characterEndpoint: "", characterId: charID, characterServiceBaseUrl: null, diceEnabled: true, diceFeatureConfiguration: {
                            apiEndpoint: "https://dice-service.dndbeyond.com", assetBaseLocation: "https://www.dndbeyond.com/dice", enabled: true, menu: true, notification: false, trackingId: ""
                        }, dimensions: { sheet: { height: 0, width: 1200 }, styleSizeType: 4, window: { height: 571, width: 1920 } }, isMobile: false, isReadonly: false, redirect: undefined, username: "example"
                    },
                    appInfo: { error: null },
                    character: {},
                    characterEnv: { context: "SHEET", isReadonly: false, loadingStatus: "LOADED" },
                    confirmModal: { modals: [] },
                    modal: { open: {} },
                    ruleData: {},
                    serviceData: { classAlwaysKnownSpells: {}, classAlwaysPreparedSpells: {}, definitionPool: {}, infusionsMappings: [], knownInfusionsMappings: [], ruleDataPool: {}, vehicleComponentMappings: [], vehicleMappings: [] },
                    sheet: { initError: null, initFailed: false },
                    sidebar: { activePaneId: null, alignment: "right", isLocked: false, isVisible: false, panes: [], placement: "overlay", width: 340 },
                    syncTransaction: { active: false, initiator: null },
                    toastMessage: {}
                },
                data: {},
                type: type,
            }

            for (let ruleID in optionalRules) {
                charactersData[charID].state.serviceData.definitionPool[optionalRules[ruleID].category] = {
                    accessTypeLookup: {},
                    definitionLookup: {},
                };
            }
        } else {
            console.warn("warn: skipping " + value.href + " due to ID not found");
        }
    });
    console.log("Finished locating Characters from Window");
    //console.debug(charactersData);
}

function getCharIDFromURL(hrefval) {
    var charID = 0;

    var matchArr = hrefval.match(charIDRegex);
    if (matchArr.length > 0) {
        var charIDStr = matchArr[1];
        if (charIDStr == "") {
            console.warn("error: empty charIdStr");
        } else {
            charID = parseInt(charIDStr);
        }
    } else {
        console.warn("error: no numbers found in " + hrefval);
    }

    return charID;
}

function insertElements() {
    console.log("Inserting Structual Elements");

    var sitemain = $("#site-main");
    var node = $("<div id='gmstats'></div>");

    sitemain.prepend(node);

    node.append(mainTableHTML);

    mainTable = $("table.primary", node);
    colStatsSubTable = $("table.stattable")

    var tableBody = $("#gm_table_body", node);

    for (let id in charactersData) {
        var cdata = charactersData[id].data;

        // primary row
        var row = $(tableRowHTML);
        var playerid = _genPlayerId(id);
        row.attr("id", playerid);
        row.attr("charname", cdata['name']);

        // second row
        var secondrow = $(tableSecondRowHTML);
        var secondRowId = _genSecondRowID(playerid);
        secondrow.attr("id", secondRowId);
        secondrow.addClass(HIDE_CLASS); // hidden by default

        // add rows
        tableBody.append(row);
        tableBody.append(secondrow);

        // setup refs
        charactersData[id].node = row;
        charactersData[id].node_details = secondrow;

        row.addClass(charactersData[id].type);
        secondrow.addClass(charactersData[id].type);
    };

    // highlight hover
    // TODO another thing that doesn't work very well with all the subtables and such...
    /*
    function isParentTableValid($t) {
        var parentTable = $t.parents('table');
        return (
            parentTable.length == mainTable.length 
            && parentTable.length > 0
            && parentTable[0] == mainTable[0]);
    }

    $('td', mainTable).hover(
        function () {
            var $t = $(this);
            if (!isParentTableValid($t)) return;

            var i = parseInt($t.index()) + 1;
            $('td:nth-child(' + i + ')', mainTable).addClass('hover_col');
            $('th:nth-child(' + i + ')', mainTable).addClass('hover_col');
            $t.parent().addClass('hover_row');
        },
        function () {
            var $t = $(this);
            if (!isParentTableValid($t)) return;

            var i = parseInt($t.index()) + 1;
            $('td:nth-child(' + i + ')', mainTable).removeClass('hover_col');
            $('th:nth-child(' + i + ')', mainTable).removeClass('hover_col');
            $t.parent().removeClass('hover_row');
        });
    */

    // set row as active when character name is clicked
    $('td.col_name .name', tableBody).click(function () {
        var node = $(this);
        var row = node.parent().parent();

        // toggle right away on click to check active status for everything else
        row.toggleClass(ACTIVE_ROW_CLASS);

        var playerid = row.attr('id');
        var isActive = row.hasClass(ACTIVE_ROW_CLASS);

        // save right away on click
        _setGMValue(ACTIVE_ROW_VAR_NAME_PREFIX + playerid, isActive);

        updateRowIfShouldBeActive(row);
    });
}

function retriveRules(charIDs) {
    return new Promise(function (resolve, reject) {
        console.log("Retriving Rules Data");
        getJSONfromURLs(rulesUrls).then((js) => {
            console.log("Rules Data Processing Start");
            js.forEach(function (rule, index) {
                isSuccessfulJSON(rule, index);
            });
            rulesData = {
                ruleset: js[0].data,
                vehiclesRuleset: js[1].data
            }
            for (let id in charactersData) {
                charactersData[id].state.ruleData = rulesData.ruleset;
                charactersData[id].state.serviceData.ruleDataPool = rulesData.vehiclesRuleset;
            }
            console.debug("Rules Data:");
            console.debug(rulesData);
            resolve();
        }).catch((error) => {
            reject(error);
        });
    });
}

function getRules(index) {
    return rulesData[index];
}

function updateAllCharData() {
    console.log("Retriving Each Char Data");

    let promises = []
    for (let id in charactersData) {
        promises.push(updateCharData(charactersData[id].url, charactersData[id].type));
    }

    Promise.all(promises)
        .then(() => {
            updateCampaignData();
            refreshTimer__checkShouldStart(refresh_autoUpdateNode);
        }).catch((error) => {
            console.log(error);
        });

    console.log("Updated All Char Data");
}

function updateCharData(url, activeType) {

    return new Promise(function (resolve, reject) {
        console.log("Retrieving Char Data");

        getJSONfromURLs([url]).then((js) => {
            //window.jstest = js;
            var totalChars = js.length;
            js.forEach(function (charJSON, index) {
                if (isSuccessfulJSON(charJSON, index)) {
                    let charId = charJSON.data.id;
                    console.debug("Processing Char: " + charId);
                    charactersData[charId].state.character = charJSON.data;
                    let promises = retriveCharacterRules(charId)
                    Promise.all(promises).then(() => {
                        var charData = window.moduleExport.getCharData(charactersData[charId].state);
                        charactersData[charId].data = charData;
                        updateElementData(charactersData[charId], charId);
                        console.log("Retrived Char Data for char " + charId + " aka " + charactersData[charId].data.name);
                        console.log(charactersData[charId]);
                        resolve();
                    });
                } else {
                    console.log("Char URL " + url + " was skipped");
                }
            });
        }).catch((error) => {
            console.log(error);
            reject();
        });
    });

}

function retriveCharacterRules(charId) {
    let promises = [];
    console.log("Looking for optional rules for " + charactersData[charId].data.name);
    for (let ruleID in optionalRules) {
        if (ruleID in charactersData[charId].state.character && charactersData[charId].state.character[ruleID].length > 0) {
            console.log("Optional ruleset for " + ruleID + " found.");
            promises.push(retriveCharacterRule(charId, ruleID));
        }
    }
    return promises;
}

function retriveCharacterRule(charId, ruleID) {
    let url = gameCollectionUrl.prefix + optionalRules[ruleID].category + gameCollectionUrl.postfix;

    let ruleIds = []
    for (let item of charactersData[charId].state.character[ruleID]) {
        ruleIds.push(item[optionalRules[ruleID].id]);
    }

    let body = {
        "campaignId": null,
        "sharingSetting": 2,
        "ids": ruleIds
    };
    return new Promise(function (resolve, reject) {
        getJSONfromURLs([url], body).then((js) => {
            js.forEach(function (charJSON, index) {
                console.log("Retrived " + ruleID + " data, processing.");
                console.log(charJSON);
                if (charJSON.success && charJSON.data.definitionData != undefined) {
                    for (let data of charJSON.data.definitionData) {
                        charactersData[charId].state.serviceData.definitionPool[optionalRules[ruleID].category].definitionLookup[data.id] = data;
                        charactersData[charId].state.serviceData.definitionPool[optionalRules[ruleID].category].accessTypeLookup[data.id] = 1;
                    }
                }
                console.log(ruleID + " finished processing.");
            });
            resolve();

        }).catch((error) => {
            console.log(error);
            reject();
        });
    });
}

//---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
//        Refresh timer
//---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

function initRefreshTimer() {
    console.log('[0] init refresh timer');

    var controls = $(".gs-controls");

    refresh_autoUpdateNode = $('input[name ="gs-auto-update"]', controls);
    minTimeNode = $('input[name ="gs-auto-duration"]', controls);

    var pbar = $(".progress-wrapper", controls);
    refresh_progressBarContents = $(".progress-bar-fill", pbar);
    refresh_progressBarCurr = $(".curr", pbar);
    refresh_progressBarTotal = $(".total", pbar);
    refresh_progressBarPct = $(".pct", pbar);

    console.log('[1] init refresh timer',
        '\ninputs', autoUpdateNode, minTimeNode,
        '\npbar contents', refresh_progressBarContents,
        '\npbar curr/total', refresh_progressBarCurr, refresh_progressBarTotal
    );

    refreshTimer__checkShouldStart(refresh_autoUpdateNode);
}

function refreshTimer__checkShouldStart(node) {
    var $node = $(node);
    let val = parseBool($node.prop("checked"));

    // console.log('refreshTimer__checkShouldStart', $node, val);

    if (val) {
        refreshTimer_start();
    } else {
        refreshTimer_end();
    }
}

function refreshTimer_start() {
    var isActive = refreshTimer_isActive();
    // console.log("refreshTimer_start: ", isActive);
    if (isActive) {
        refreshTimer_end();
    }

    refreshTimer_setActive(true);
    refresh_timeSinceLastRefresh = 0;
    refreshTimer_tockNext();
}

function refreshTimer_end() {
    var isActive = refreshTimer_isActive();
    // console.log("refreshTimer_end: ", isActive);
    if (!isActive) {
        return;
    }

    clearTimeout(refresh_currentTimer);
    refresh_timeSinceLastRefresh = 0;
    refresh_currentTimer = null;
    refreshTimer_setActive(false);

    refreshTimer_updatePbar();
}

function refreshTimer_isActive() {
    return refresh_isTimerActive;
}

function refreshTimer_setActive(newState) {
    refresh_isTimerActive = newState;
}

function refreshTimer_tock() {
    refresh_timeSinceLastRefresh += tockDuration * 1000;

    var minTime = refreshTimer_getMinTime();
    var isActive = refreshTimer_isAutoUpdateActive();

    // console.log('refreshTimer_tock', 
    //     'isActive:', isActive,
    //     'minTime:', minTime / 1000,
    //     'timeSinceLast:', timeSinceLastRefresh / 1000
    // );

    if (refresh_timeSinceLastRefresh < minTime || !isActive) {
        refreshTimer_tockNext();
        return;
    }

    refreshTimer_updatePbar();
    updateAllCharData();
}

function refreshTimer_tockNext() {
    refreshTimer_updatePbar();
    refresh_currentTimer = setTimeout(refreshTimer_tock, tockDuration * 1000);
}

function refreshTimer_getMinTime() {
    let refreshTime = _getGMValueOrDefault("-updateDuration", 30);
    let refreshTimeMiliSecs = refreshTime * 1000;

    return refreshTimeMiliSecs;
}

function refreshTimer_isAutoUpdateActive() {
    return refresh_autoUpdateNode.is(':checked');
}

function refreshTimer_updatePbar() {
    var minTime = refreshTimer_getMinTime();
    var curTime = refresh_timeSinceLastRefresh;
    var pct = Math.floor(curTime / minTime * 100);

    refresh_progressBarContents.attr('style', "width: {0}%;".format(pct))
    refresh_progressBarCurr.html(Math.round(curTime / 1000));
    refresh_progressBarTotal.html(Math.round(minTime / 1000));
    refresh_progressBarPct.html("{0}%".format(Math.round(pct)));
}

//---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
//        Element Updating Functions
//---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

function insertCampaignElements() {
    console.log("Inseting Campaign Elements");
    campaignNode = mainTable;
    insertControls(campaignNode);
    // insertVisibilityControls(campaignNode, campaignPrefix);
    // insertStoredElements(campaignNode, campaignPrefix);

}

function insertControls(parent) {
    console.log("Inserting Main Controls");

    let controlsNode = parent.find('.gs-controls');

    let autoUpdate = controlsNode.find('input[name ="gs-auto-update"]');
    let autoDuration = controlsNode.find('input[name ="gs-auto-duration"]');
    let fontSize = controlsNode.find('select[name ="gs-font-size"]');

    let displayDeactive = controlsNode.find('input[name ="gs-display-deactive"]');
    let displayUnassigned = controlsNode.find('input[name ="gs-display-unassigned"]');

    // Loads ideally value set for this campaign, if not found it loads the last saved value otherwise it defaults
    let autoUpdateLoaded = _getGMValueOrDefault("-autoUpdate", autoUpdateDefault);
    let updateDurationLoaded = _getGMValueOrDefault("-updateDuration", updateDurationDefault);
    let fontSizeSettingLoaded = _getGMValueOrDefault("-fontSize", fontSizeDefault);

    let displayDeactiveSettingLoaded = _getGMValueOrDefault("-displaydeactive", displayDeactiveDefault);
    let displayUnassignedSettingLoaded = _getGMValueOrDefault("-displayunassigned", displayUnassignedDefault);

    autoUpdate.prop('checked', autoUpdateLoaded);
    autoDuration.prop('value', updateDurationLoaded);
    fontSize.val(fontSizeSettingLoaded).change();
    onFontSizeChange(mainTable, fontSizeSettingLoaded);
    onFontSizeChange(colStatsSubTable, fontSizeSettingLoaded);
    onFontSizeChange($("table.secondary", mainTable), fontSizeSettingLoaded);

    displayDeactive.prop('checked', displayDeactiveSettingLoaded);
    displayUnassigned.prop('checked', displayUnassignedSettingLoaded);
    onDisplayTypeChange('deactivated', displayDeactiveSettingLoaded);
    onDisplayTypeChange('unassigned', displayUnassignedSettingLoaded);

    autoUpdate.change(function () {
        var $this = $(this);
        let val = parseBool($this.prop("checked"));
        
        _setGMValue("-autoUpdate", val);

        refreshTimer__checkShouldStart($this);
    });
    autoDuration.change(function () {
        let val = parseIntSafe($(this).val());

        // set a reasonable lower bound
        if (val <= 10) {
            $(this).val(10);
            val = 10;
        }

        _setGMValue("-updateDuration", val);
    });
    fontSize.change(function () {
        let val = parseIntSafe($(this).val());
        _setGMValue("-fontSize", val);

        onFontSizeChange(mainTable, val);
        onFontSizeChange(colStatsSubTable, val);
        onFontSizeChange($("table.secondary", mainTable), val);
    });

    displayDeactive.change(function () {
        let val = parseBool($(this).prop("checked"));
        _setGMValue("-displaydeactive", val);

        onDisplayTypeChange('deactivated', val);
    });
    displayUnassigned.change(function () {
        let val = parseBool($(this).prop("checked"));
        _setGMValue("-displayunassigned", val);

        onDisplayTypeChange('unassigned', val);
    });
}

function onFontSizeChange(table, updatedFontSize) {
    for (const idx in fontSizeMap) {
        if (table.hasClass(fontSizeMap[idx])) {
            table.removeClass(fontSizeMap[idx]);
        }
    }

    var newFontClass = fontSizeMap[updatedFontSize];
    table.addClass(newFontClass);
}

function onDisplayTypeChange(type, newval) {
    var rows = $("tr." + type, mainTable);

    if (newval) {
        rows.removeClass(HIDE_CLASS);
    } else {
        rows.addClass(HIDE_CLASS);
    }
}

function updateCampaignData() {
    // sort table by char name
    // sortTable(mainTable, 'asc');
    // TODO maybe readd table sort later... gotta figure out a way to make it not
    //      suck out sub-table rows into the main table

    // calc totals
    var totalsRow = $("#totals", mainTable);
    globalCurrencies = {};
    globalLanguages = [];

    var len = Object.keys(charactersData).length;

    var idx = 0;
    for (let id in charactersData) {
        var curChar = charactersData[id];

        var charData = charactersData[id].data;
        var charType = charactersData[id].type;

        if (charType == 'active') {
            // update global counters
            // -------------------------------------------------------

            // money
            $.each(charData.currencies, (key, val) => {
                if (key in globalCurrencies) {
                    globalCurrencies[key] += val;
                } else {
                    globalCurrencies[key] = val;
                }
            });

            var isLastChar = idx == len - 1;
            if (isLastChar) {
                updateMoney(totalsRow, globalCurrencies, showSumOnly=true);
            }

            // languages
            updateLanguages(
                totalsRow,
                charData.proficiencyGroups,
                globalLanguages,
                updateHtml = isLastChar);
        }

        idx++;
    }
}


function updateElementData(allCharData, charId) {
    const character = allCharData.data;
    const parent = allCharData.node;
    const parent_secondrow = allCharData.node_details;

    console.log('update info: ', charId, character);

    updateRowIfShouldBeActive(parent);

    updateNameBlock(parent, allCharData, character);
    updateHitPointInfo(parent, character.hitPointInfo, character.deathSaveInfo);
    updateArmorClass(parent, character.armorClass, character.initiative);
    updateSpeeds(parent, character);

    updateAbilties(parent, character.abilities);
    updatePassives(parent, character.passivePerception, character.passiveInvestigation, character.passiveInsight);
    updateMoney(parent, character.currencies);
    updateSkillProfs(parent, parent_secondrow, character.skills, character.customSkills);
    updateLanguages(parent, character.proficiencyGroups);
}

function updateRowIfShouldBeActive(primaryRow) {
    var playerId = primaryRow.attr('id');
    var secondrow = $('#{0}'.format(_genSecondRowID(playerId)), primaryRow.parent());
    
    var isActive = _getGMValueOrDefault(ACTIVE_ROW_VAR_NAME_PREFIX + playerId, false);

    // console.log('update row, player:', playerId, '\nprimary', primaryRow, '\nsecond', secondrow, '\nisActive', isActive);
    if (isActive) {
        // show details
        primaryRow.addClass(ACTIVE_ROW_CLASS);
        primaryRow.addClass(ACTIVE_FIRST_ROW_CLASS);

        secondrow.removeClass(HIDE_CLASS);

        $('td.col_name', primaryRow).attr('rowspan', '2');
        $('td.col_skills', primaryRow).addClass(HIDE_CLASS);
        $('td.col_languages', primaryRow).attr('colspan', '2');
    } else {
        // hide details
        primaryRow.removeClass(ACTIVE_ROW_CLASS);
        primaryRow.removeClass(ACTIVE_FIRST_ROW_CLASS);

        secondrow.addClass(HIDE_CLASS);

        $('td.col_name', primaryRow).attr('rowspan', '1');
        $('td.col_skills', primaryRow).removeClass(HIDE_CLASS);
        $('td.col_languages', primaryRow).attr('colspan', '1');
    }

    updateNameTooltip($(".name", primaryRow), isActive);
}

function updateNameTooltip(node, activeState) {
    editTooltipLabel(node, activeState ? "Hide details" : "Show details");
}

function updateNameBlock(parent, allCharData, character) {
    var nameblock = parent.find('td.col_name');

    $(".name", nameblock).html(character.name);

    updateNameBlockViewEditLinks(allCharData, nameblock);

    updateNameBlockExhaust(character, nameblock);

    updateNameBlockSaveDC(character, nameblock);

    updateNameBlockInspiration(character, nameblock);

    updateNameBlockProfBonus(character, nameblock);
}

function updateNameBlockViewEditLinks(allCharData, nameblock) {
    const links = $(".links", nameblock);
    const view = $(".view", links);
    const edit = $(".edit", links);

    displayIfUrlExists(allCharData.viewurl, view);
    displayIfUrlExists(allCharData.editurl, edit);

    editTooltipLabel(view.parent(), "View {0}".format(allCharData.data.name));
    editTooltipLabel(edit.parent(), "Edit {0}".format(allCharData.data.name));
}

function canEditCharacter(allCharData) {
    return character.editurl !== null && character.editurl.length > 0;
}

function displayIfUrlExists(url, node, hideClass = HIDE_CLASS) {
    if (url !== null && url.length > 0) {
        node.removeClass(hideClass);
        node.attr('href', url);
    } else {
        node.addClass(hideClass);
        node.attr('href', '');
    }
}

function updateNameBlockInspiration(character, nameblock) {
    if (character.inspiration) {
        $(".inspiration", nameblock).removeClass(HIDE_CLASS);
    } else {
        $(".inspiration", nameblock).addClass(HIDE_CLASS);
    }
}


function updateNameBlockProfBonus(character, nameblock) {
    $(".pbval", $(".profbonus", nameblock)).html(
        "{0}{1}".format(getSign(character.proficiencyBonus), character.proficiencyBonus)
    );
}

function updateNameBlockExhaust(character, nameblock) {
    const maxExhaust = 6;

    var conditions = character.conditions;
    var isExhausted = false;
    var exhaustLevel = 0;

    conditions.forEach((item, idx) => {
        if (item.definition.slug == 'exhaustion') {
            isExhausted = true;
            exhaustLevel = item.level;
        }
    });

    const exhaustBlock = $(".exhaust", nameblock);
    if (isExhausted) {
        var exhaustStr = "";
        for (var i = 0; i < exhaustLevel; i++) {
            exhaustStr += "• ";
        }

        var restStr = "";
        for (var i = 0; i < (maxExhaust - exhaustLevel); i++) {
            restStr += "- ";
        }

        exhaustBlock.removeClass(HIDE_CLASS);
        exhaustBlock.html("<span>{0}</span>{1}".format(exhaustStr, restStr));
    } else {
        exhaustBlock.addClass(HIDE_CLASS);
        exhaustBlock.html('');
    }
}

function updateNameBlockSaveDC(character, nameblock) {
    // add any class save DCs
    var classes = character.classes;
    var spellCasterSaveDCs = character.spellCasterInfo.castingInfo.saveDcs;

    var savestr = [];
    var remainingClassNames = {};
    for (var i = 0; i < classes.length; i++) {
        var c = classes[i];
        var slug = c.slug;

        if (slug == 'monk') {
            // special case for ki since it doesn't seem to show up in data
            // ki save DC = 8 + your proficiency bonus + your Wisdom modifier
            var dc = 8;
            dc += character.proficiencyBonus;

            // TODO should this be done programmatically?
            // abilities[4] == 'wis', dnd beyond id == 5 == 'wis'
            dc += character.abilities[4].modifier;

            savestr.push("{0} <span class='lvl'>{1}</span>: <span class='dc'>{2}</span>".format(c.definition.name, c.level, dc));

            continue;
        }

        remainingClassNames[slug] = "{0} <span class='lvl'>{1}</span>".format(c.definition.name, c.level);
    }

    for (var i = 0; i < spellCasterSaveDCs.length; i++) {
        var c = spellCasterSaveDCs[i]
        var val = c.value;

        for (var j = 0; j < c.sources.length; j++) {
            var cname = c.sources[j].definition.name;

            savestr.push("{0} <span class='lvl'>{1}</span>: <span class='dc'>{2}</span>".format(cname, c.sources[j].level, val));

            if (c.sources[j].slug in remainingClassNames) {
                delete remainingClassNames[c.sources[j].slug];
            }
        }
    }

    var savedcnode = $(".spellsavedc", nameblock);

    for (const key in remainingClassNames) {
        savestr.push(remainingClassNames[key]);
    }

    savedcnode.html(savestr.join("<br />"));
}

function updateHitPointInfo(parent, hitPointInfo, deathSaveInfo) {
    var hp = parent.find('td.col_hp');

    // hp -------------------------------------------------
    var max = hitPointInfo.totalHp;
    var remaining = hitPointInfo.remainingHp;

    var hasbonus = false;
    var bonus = 0;
    if (hitPointInfo.bonusHp !== null && hitPointInfo.bonusHp > 0) {
        bonus = hitPointInfo.tempHp;

        remaining += bonus;

        hasbonus = true;
    }

    var hastemp = false;
    var temp = 0;
    if (hitPointInfo.tempHp !== null && hitPointInfo.tempHp > 0) {
        temp = hitPointInfo.tempHp;

        remaining += temp;

        hastemp = true;
    }

    var pct_left = remaining / max * 100;

    var color = 'normal';
    if (pct_left < 50) color = 'bad';
    else if (pct_left < 75) color = 'hurt';
    else if (pct_left < 100) color = 'good';
    else if (pct_left > 100) color = 'overheal';
    else color = 'normal';

    var bonus_str = "";
    if (hasbonus) {
        bonus_str = "<br />bonus: <span class='overheal'>{0}</span>".format(bonus);
    }

    var temp_str = "";
    if (hastemp) {
        temp_str = "<br />temp: <span class='overheal'>{0}</span>".format(temp);
    }

    // death saves ------------------------------------------
    var fails = deathSaveInfo.failCount;
    var success = deathSaveInfo.successCount;
    var stable = deathSaveInfo.isStabilized;

    var dsstr = "";
    if (stable || (success >= 3)) {
        dsstr = "<br />--<span class='stable'>stable</span>--"
    } else if (fails > 0 || success > 0) {
        if (fails > 0) {
            dsstr += "<br />F: <span class='fail'>{0}</span>".format(fails);
        }

        if (success > 0) {
            dsstr += "<br />S: <span class='save'>{0}</span>".format(success);
        }
    }

    // put it all together

    hp.html(
        `<span class="{0}">{1}</span>{2}{3}{4}`
        .format(
            color,
            "{0}/{1} {2}%".format(remaining, max, Math.round(pct_left)),
            bonus_str,
            temp_str,
            dsstr
        )
    );
}

function updateArmorClass(parent, armorClass, init) {
    var node = parent.find('td.col_ac');
    $(".acval", node).html(armorClass);
    $(".initval", node).html("{0}{1}".format(getSign(init), Math.abs(init)));
}

/*
function updateInitiative(parent, initiative){
    parent.find('.gs-intv-sign').html(getSign(initiative));
    parent.find('.gs-intv-number').html(Math.abs(initiative));
}
*/

function updateSpeeds(parent, character) {
    // speed
    var node = parent.find('td.col_speed');
    node.empty();

    var speeds = character.speeds;
    var speedarr = [];
    speeds.forEach(function (item, index) {
        if (item.distance > 0) {
            speedarr.push("<span>{0}</span> {1}".format(item.distance, item.key));
        }
    });

    node.append(speedarr.join("<br />"));

    // do we have dark vision or similar??
    var senses = character.senses;
    var sensearr = [];
    for (var i = 0; i < senses.length; i++) {
        var s = senses[i];

        if (s.distance > 0) {
            var name = senseToName[s.key];

            // var distUnits = distanceUnit(s.distance);
            sensearr.push(
                addTooltip(
                    "{0}: <span>{1}</span>".format(name, s.distance),
                    s.key,
                    tag = "div"
                ));
        }
    }

    if (sensearr.length > 0) {
        node.append("<br />");
        node.append(sensearr.join(""));
    }
}

function updateAbilties(parent, abilities) {
    abilities.forEach(function (item, index) {
        var abilityKey = item.name;
        var cellName = ".col_" + abilityKey;

        var cell = $(cellName, parent);
        cell.empty();

        // stat
        cell.append("<span class='high' {1}>{0}</span><br />".format(item.totalScore));//, insertTooltipAttributes(abilityKey + ' score')));

        // bonus
        var mod = item.modifier;
        var color = "";
        if (mod > 0) { color = "high"; }
        else if (mod < 0) { color = "low"; }

        cell.append("<span class='{0}' {3}>{1}{2}</span><br />".format(color, getSign(mod), Math.abs(mod)));//, insertTooltipAttributes(abilityKey + ' bonus')));

        // save
        // we only show one's we're proficient in or are different than the bonus
        var save = item.save;
        var isprof = item.proficiency;
        color = "";

        if (isprof) { color = "prof"; }
        else if (mod > 0) { color = "high"; }
        else if (mod < 0) { color = "low"; }

        if (!isprof || mod == save) {
            color += " same";
        }

        // if (isprof || mod != save) {
            cell.append("<span class='{0}' {3}>{1}{2}</span><br />".format(color, getSign(save), Math.abs(save)));//, insertTooltipAttributes(abilityKey + ' save')));
        // }

        cell.append('<div class="stat_title">{0}</div>'.format(abilityKey))
    });
}

function updatePassives(parent, passPerception, passInvestigation, passInsight) {
    parent.find("td.col_passives").html("{0}{1}{2}".format(
        addTooltip(
            "per: <span>{0}</span><br />".format(passPerception),
            "perception",
            tag = "div"),
        addTooltip(
            "inv: <span>{0}</span><br />".format(passInvestigation),
            "investigation",
            tag = "div"),
        addTooltip(
            "ins: <span>{0}</span>".format(passInsight),
            "insight",
            tag = "div")
    ));
}

function updateMoney(parent, currencies, showSumOnly=false) {
    console.log('updateMoney', 'parent:', parent, 'showSumOnly:', showSumOnly);
    // individual vals
    var ppc = $(".ppc", parent);
    var epc = $(".epc", parent);
    var gpc = $(".gpc", parent);
    var spc = $(".spc", parent);
    var cpc = $(".cpc", parent);

    var pp = $(".pp", ppc);
    var ep = $(".ep", epc);
    var gp = $(".gp", gpc);
    var sp = $(".sp", spc);
    var cp = $(".cp", cpc);

    updateCurrencyVis(ppc, pp, currencies.pp, showSumOnly);
    updateCurrencyVis(epc, ep, currencies.ep, showSumOnly);
    updateCurrencyVis(gpc, gp, currencies.gp, showSumOnly);
    updateCurrencyVis(spc, sp, currencies.sp, showSumOnly);
    updateCurrencyVis(cpc, cp, currencies.cp, showSumOnly);

    // total gp estimate
    var gpnum = currencies.gp;
    gpnum += currencies.pp * 10.0;
    gpnum += currencies.ep / 2.0;
    gpnum += currencies.sp / 10.0;
    gpnum += currencies.cp / 100.0;

    var total = $(".total", $(".col_money", parent));
    var hr = $("hr", $(".col_money", parent));

    if (showSumOnly) {
        hr.addClass(HIDE_CLASS);
        total.html("~<span>{0}</span> gp".format(roundDown(gpnum)));
    } else {
        gp.removeClass(HIDE_CLASS);
        hr.removeClass(HIDE_CLASS);

        if (gpnum > 0 && gpnum % 1 != 0) {
            gp.removeClass("gponly");
            hr.removeClass(HIDE_CLASS);
            total.html("~<span>{0}</span> gp".format(roundDown(gpnum)));
        } else {
            gp.addClass("gponly");
            hr.addClass(HIDE_CLASS);
            total.empty();
        }
    } 
}

function updateCurrencyVis(c, cval, val, forceHide, hideClass = HIDE_CLASS) {
    console.log('updateCurrencyVis forcehide:', forceHide);
    if (forceHide) {
        c.addClass(hideClass);
        return;
    }

    if (val > 0) { c.removeClass(hideClass); }
    else { c.addClass(hideClass); }
    cval.html(val);
}

function updateSkillProfs(parent, parent_secondrow, skills, customs) {
    function skillSort(x, y) {
        if (x.name < y.name) return -1;
        if (x.name > y.name) return 1;
        return 0;
    }

    skills.sort(skillSort);
    customs.sort(skillSort);

    everything = [...genSkillsArray(skills), ...genSkillsArray(customs, isCustom=true)];
    
    var skillsnode = $(".col_skills", parent);
    skillsnode.html(everything.join(" "));

    // copy to details row as well
    var skillsnode_details = $(".col_skills", parent_secondrow);
    skillsnode_details.html('<span class="activetitle">Skills:</span> ' + skillsnode.html());
}

function genSkillsArray(skills, isCustom=false) {
    outarr = [];

    skills.forEach((item, idx) => {
        var name = item.name;
        var mod = Math.abs(item.modifier);
        var sign = getSign(item.modifier, forceZero=true);
        var color = '';

        if (item.modifier == 0) {
            color = 'normal';
        } else if (item.modifier > 0) {
            color = 'high';
        } else {
            color = 'low';
        }

        if (isCustom) {
            color += ' custom';
        }

        function getProfText(classtype, tooltip, name, sign, mod, color, sup="") {
            // NOTE: we have to push the tooltip within the container for the skill, because the tooltip stuff uses
            // ::after same as our commas between skills at the moment :/ 
            return "<span class='c {0} {1}'>{2}</span>".format(
                classtype,
                color,
                addTooltip(
                    "{0}<sup>{3}</sup> <span class='value'>{1}{2}</span>".format(name, sign, mod, sup),
                    tooltip));
        }

        if (item.expertise) {
            outarr.push(getProfText('expert', "Expertise", name, sign, mod, color, "🇪"));
        } else if (item.proficiency) {
            outarr.push(getProfText('prof', "Proficiency", name, sign, mod, color, ""));
        } else if (item.halfProficiency) {
            outarr.push(getProfText('halfprof', "½ Proficiency", name, sign, mod, color, "½"));
        } else {
            outarr.push(getProfText('noprof', "Not Proficient", name, sign, mod, color, ""));
        }
    });

    return outarr;
}

function updateLanguages(parent, profGroups, langs = [], updateHtml = true) {
    profGroups.forEach((item, idx) => {
        if (item.label == "Languages") {
            item.modifierGroups.forEach((lang, lidx) => {
                var l = "<span>{0}</span>".format(lang.label);

                if (!langs.includes(l)) {
                    langs.push(l);
                }
            });
        }
    });

    if (updateHtml) {
        langs.sort();
        $(".col_languages", parent).html(langs.join(", "));
    }

    return langs;
}

//---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
//        D&DBeyond Module Loader
//---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

function loadModules(modules) {
    /*
        A near direct copy of the function from http://media.dndbeyond.com/character-tools/characterTools.bundle.71970e5a4989d91edc1e.min.js
        This basically loads in the modules in https://media.dndbeyond.com/character-tools/vendors~characterTools.bundle.f8b53c07d1796f1d29cb.min.js and similar module based scripts
        these are stored in window.jsonpDDBCT and can be loaded by this script and interacted with by active modules
    */
    console.log("Loading modules");

    function webpackJsonpCallback(data) {
        /*
            This allows additonal modules to be added run, the input format needs to be at least a two dimentional array,
            e.g. [[2],[function (module, exports, __webpack_require__) {...},...]] or [2],{34: function (module, exports, __webpack_require__) {...},...}] if you want to have set module id's
            you can also run modules by adding a third element to the argument data, e.g. [4],{69: function (module, __webpack_exports__, __webpack_require__) {...},...}, [69,4]] which will run the module 69 in chunk 4
            I am not 100% on the logic of this, so feel free to expand on this and futher comment to help out!
        */
        var chunkIds = data[0];
        var moreModules = data[1];
        var executeModules = data[2];
        var moduleId,
            chunkId,
            i = 0,
            resolves = [];
        for (; i < chunkIds.length; i++) {
            chunkId = chunkIds[i];
            if (Object.prototype.hasOwnProperty.call(installedChunks, chunkId) && installedChunks[chunkId]) {
                resolves.push(installedChunks[chunkId][0])
            }
            installedChunks[chunkId] = 0
        }
        for (moduleId in moreModules) {
            if (Object.prototype.hasOwnProperty.call(moreModules, moduleId)) {
                modules[moduleId] = moreModules[moduleId]
            }
        }
        if (parentJsonpFunction) parentJsonpFunction(data);
        while (resolves.length) {
            resolves.shift()()
        }
        deferredModules.push.apply(deferredModules, executeModules || []);
        return checkDeferredModules()
    }

    function checkDeferredModules() {
        var result;
        for (var i = 0; i < deferredModules.length; i++) {
            var deferredModule = deferredModules[i];
            var fulfilled = true;
            for (var j = 1; j < deferredModule.length; j++) {
                var depId = deferredModule[j];
                if (installedChunks[depId] !== 0) fulfilled = false
            }
            if (fulfilled) {
                deferredModules.splice(i--, 1);
                result = __webpack_require__(__webpack_require__.s = deferredModule[0])
            }
        }
        return result
    }
    var installedModules = {};
    var installedChunks = {
        0: 0
    };
    var deferredModules = [];

    function __webpack_require__(moduleId) {
        if (installedModules[moduleId]) {
            return installedModules[moduleId].exports
        }
        var module = installedModules[moduleId] = {
            i: moduleId,
            l: false,
            exports: {}
        };
        modules[moduleId].call(module.exports, module, module.exports, __webpack_require__);
        module.l = true;
        return module.exports
    }
    __webpack_require__.m = modules;
    __webpack_require__.c = installedModules;
    __webpack_require__.d = function (exports, name, getter) {
        if (!__webpack_require__.o(exports, name)) {
            Object.defineProperty(exports, name, {
                enumerable: true,
                get: getter
            })
        }
    };
    __webpack_require__.r = function (exports) {
        if (typeof Symbol !== "undefined" && Symbol.toStringTag) {
            Object.defineProperty(exports, Symbol.toStringTag, {
                value: "Module"
            })
        }
        Object.defineProperty(exports, "__esModule", {
            value: true
        })
    };
    __webpack_require__.t = function (value, mode) {
        if (mode & 1) value = __webpack_require__(value);
        if (mode & 8) return value;
        if (mode & 4 && typeof value === "object" && value && value.__esModule) return value;
        var ns = Object.create(null);
        __webpack_require__.r(ns);
        Object.defineProperty(ns, "default", {
            enumerable: true,
            value: value
        });
        if (mode & 2 && typeof value != "string") {
            for (var key in value) {
                __webpack_require__.d(ns, key, function (key) {
                    return value[key]
                }.bind(null, key));
            }
        }

        return ns
    };
    __webpack_require__.n = function (module) {
        var getter = module && module.__esModule ? function getDefault() {
                return module.default
            } :
            function getModuleExports() {
                return module
            };
        __webpack_require__.d(getter, "a", getter);
        return getter
    };
    __webpack_require__.o = function (object, property) {
        return Object.prototype.hasOwnProperty.call(object, property)
    };
    __webpack_require__.p = "";
    var jsonpArray = window.jsonpDDBCT = window.jsonpDDBCT || [];
    var oldJsonpFunction = jsonpArray.push.bind(jsonpArray); //This allows additonal modules to be added and run by using window.jsonpDDBCT.push(modules) which calls webpackJsonpCallback(modules) above
    jsonpArray.push2 = webpackJsonpCallback;
    jsonpArray = jsonpArray.slice();
    for (var i = 0; i < jsonpArray.length; i++) webpackJsonpCallback(jsonpArray[i]);
    var parentJsonpFunction = oldJsonpFunction;
    deferredModules.push([2080, 2]); //This sets module 2080 as an active module and is run after the other modules are loaded
    checkDeferredModules();
    console.log("Finished loading modules");
}


//---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
//        Generic Functions
//---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

function isSuccessfulJSON(js, name) {
    let success = true;
    if (js.length < 1 || js.success == undefined) {
        console.warn("JSON " + name + " is malformed");
        return false;
    } else if (js.success == false) {
        console.warn("JSON " + name + "'s retrieval was unsuccessful");
        return false;
    } else if (js.success != true) {
        console.warn("JSON " + name + "'s retrieval was unsuccessful and is malformed");
        return false;
    } else if (js.data == undefined || js.data.length < 1) {
        console.warn("JSON " + name + "'s data is malformed");
        return false;
    }
    return true;
}

function loadStylesheet(href) {
    console.debug('Start: Adding CSS Stylesheet ' + href);
    var link = document.createElement('link');
    link.rel = "stylesheet";
    link.type = "text/css";
    link.href = href;
    document.head.appendChild(link);
    console.debug('Done: Adding CSS Stylesheet');
}

function getJSONfromURLs(urls, body, headers, cookies) {
    return new Promise(function (resolve, reject) {
        console.log("Fetching: ", urls);
        var proms = urls.map(d => fetchRequest(d, body, cookies));
        Promise.all(proms)
            .then(ps => Promise.all(ps.map(p => p.json()))) // p.json() also returns a promise
            .then(jsons => {
                console.log("JSON Data Retrived");
                resolve(jsons);
            })
            .catch((error) => {
                reject(error);
            });
    });
}

function fetchRequest(url, body, headers, cookies) {
    let options = {};
    let myHeaders = new Headers({
        'X-Custom-Header': 'hello world',
    });
    for (let id in authHeaders) {
        myHeaders.append(id, authHeaders[id]);
    }
    if (body != undefined && body != '') {
        options.method = 'POST'
        myHeaders.append('Accept', 'application/json');
        myHeaders.append('Content-Type', 'application/json');
        options.body = JSON.stringify(body);
    }
    if (cookies != undefined && cookies != '') {
        options.cookies = cookies;
    }
    options.credentials = 'include';
    options.headers = myHeaders;
    console.log(options);
    return fetch(url, options);
}

function getSign(input, forceZero = false) {
    let number = parseIntSafe(input);
    if (number == 0) return forceZero ? positiveSign : "";
    return number >= 0 ? positiveSign : negativeSign
}

function roundDown(input) {
    let number = parseInt(input);
    if (isNaN(number)) {
        return NaN;
    }
    return Math.floor(input);
}

function roundUp(input) {
    let number = parseInt(input);
    if (isNaN(number)) {
        return NaN;
    }
    return Math.ceil(input);
}

function divide(numeratorInput, denominatorInput) {
    let numerator = parseInt(numeratorInput);
    let denominator = parseInt(denominatorInput);
    if (isNaN(numerator) || isNaN(denominator)) {
        return NaN;
    }
    return numerator / denominator;
}

function distanceUnit(input) {
    let number = parseIntSafe(input);
    let unit = 'ft.';
    if (number && number % FEET_IN_MILES === 0) {
        number = number / FEET_IN_MILES;
        unit = 'mile' + (Math.abs(number) === 1 ? '' : 's');
    }
    return unit;
}

function parseIntSafe(input) {
    let number = parseInt(input);
    if (isNaN(number)) {
        number = 0;
    }
    return number;
}

function parseBool(x) {
    return x ? true : false;
}

function addTooltip(inStr, tiptext, tag = "span", placement = DEFAULT_TOOLTIP_PLACEMENT) {
    // https://github.com/ghosh/microtip#usage
    return "<{1} {2}>{0}</{1}>".format(inStr, tag, insertTooltipAttributes(tiptext, placement));
}

function insertTooltipAttributes(tiptext, placement = DEFAULT_TOOLTIP_PLACEMENT) {
    // title='{0}' removed to avoid double tooltip popups
    return "role='tooltip' data-microtip-position='{1}' aria-label='{0}'".format(tiptext, placement);
}

function editTooltipLabel(node, newText) {
    node.attr('aria-label', newText);
}

function sortTable(table, order) {
    var asc = order === 'asc',
        tbody = table.find('tbody');

    tbody.find('tr').sort(function (a, b) {
        if (asc) {
            return $('td:first', a).text().localeCompare($('td:first', b).text());
        } else {
            return $('td:first', b).text().localeCompare($('td:first', a).text());
        }
    }).appendTo(tbody);
}

function _getCampaignPrefix() {
    return scriptVarPrefix + "-" + campaignID
}

function _getGMValueOrDefault(name, defaultVal) {
    return GM_getValue(_getCampaignPrefix() + name, GM_getValue(scriptVarPrefix + name, defaultVal));
}

function _setGMValue(name, val) {
    GM_setValue(_getCampaignPrefix() + name, val);
    GM_setValue(scriptVarPrefix + name, val);
}

function _genPlayerId(id) {
    return "player-" + id;
}

function _genSecondRowID(firstRowID) {
    return firstRowID + "_details";
}