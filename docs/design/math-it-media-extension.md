# math-it-media — Taxonomy Extension for Lyceora M1

**Path:** Recupero Matematica — Scuola Media (Italian 2ª media, recovery of a math insufficiency)
**Schema:** os-taxonomy (github.com/withmarbleapp/os-taxonomy). Extension IDs use the `lyc_` prefix; `name`/`description`/`evidence`/`assessmentPrompt` are bilingual `{it,en}`. Anchor edges point down to REAL `mt_` topics (ages ~5–12) so the adaptive diagnostic can descend into foundational gaps.

## Verification (run against topics.json — 1590 topics / 503 math)

- **Micro-topics:** 60 (POTENZE 10, DIVISIBILITÀ 7, FRAZIONI 10, RADICI 5, EQUIVALENZE 7, PIANO CARTESIANO 5, POLIGONI 11, PITAGORA 5).
- **Internal edges:** 106. **Anchor edges:** 50 → 44 distinct real `mt_` IDs; all 44 confirmed present in topics.json.
- **Cycle check:** DAG confirmed, no cycles.
- **Reachability:** 60/60 micro-topics reachable from at least one target via prerequisite edges; every cluster's own target self-covers its cluster.
- **No orphan roots:** every micro-topic has at least one prerequisite (internal and/or anchor); no micro-topic floats free.
- Verified by script `scratchpad/vgf.py` (encodes the tables below and checks DAG + reachability + anchor existence).

## Diagnostic entry points (target / exit-level topics — one per cluster)

The adaptive pre-assessment starts at these 8 topics; on failure it probes prerequisites downward through the edges in section 2.

| Cluster | Target topic (exit level) | Age |
| :-- | :-- | :-- |
| POTENZE | `lyc_potenze_espressioni` | 12–14 |
| DIVISIBILITÀ | `lyc_div_mcm_mcd_problemi` | 12–14 |
| FRAZIONI | `lyc_fraz_espressioni` | 12–14 |
| RADICI | `lyc_radici_espressioni` | 13–14 |
| EQUIVALENZE | `lyc_equiv_problemi` | 12–14 |
| PIANO CARTESIANO | `lyc_piano_figure` | 12–14 |
| POLIGONI | `lyc_area_problemi` | 12–14 |
| TEOREMA DI PITAGORA | `lyc_pit_applicazioni_figure` | 13–14 |

---

## 1. Decomposition table (60 micro-topics)

Types: CONCEPTUAL / PROCEDURAL / REPRESENTATIONAL / LANGUAGE / META. `T` = cluster target.

### 1.1 POTENZE (10)

| id | name it / en | type | age | desc it / en |
| :-- | :-- | :-- | :-- | :-- |
| lyc_potenze_def | Definizione di potenza / Definition of a power | CONCEPTUAL | 11–12 | La potenza come prodotto di fattori uguali: base, esponente, valore. / A power as a product of equal factors: base, exponent, value. |
| lyc_potenze_lettura | Scrittura e lettura delle potenze / Reading and writing powers | REPRESENTATIONAL | 11–12 | Leggere/scrivere potenze; riconoscere quadrati e cubi. / Read/write powers; recognise squares and cubes. |
| lyc_potenze_particolari | Potenze particolari (esp. 0 e 1) / Special powers (exp. 0 and 1) | CONCEPTUAL | 11–12 | Casi speciali: esponente 0 e 1, potenze di 0 e 1. / Special cases: exponent 0 and 1, powers of 0 and 1. |
| lyc_potenze_prod_stessa_base | Prodotto di potenze con stessa base / Product of powers, same base | PROCEDURAL | 11–12 | Moltiplicare potenze di ugual base sommando gli esponenti. / Multiply same-base powers by adding exponents. |
| lyc_potenze_quoz_stessa_base | Quoziente di potenze con stessa base / Quotient of powers, same base | PROCEDURAL | 11–12 | Dividere potenze di ugual base sottraendo gli esponenti. / Divide same-base powers by subtracting exponents. |
| lyc_potenze_potenza_di_potenza | Potenza di potenza / Power of a power | PROCEDURAL | 11–12 | Elevare una potenza a potenza moltiplicando gli esponenti. / Raise a power to a power by multiplying exponents. |
| lyc_potenze_prod_stesso_esp | Potenze con lo stesso esponente / Powers with the same exponent | PROCEDURAL | 12–13 | Prodotto/quoziente di potenze con ugual esponente e basi diverse. / Product/quotient of powers with equal exponent, different bases. |
| lyc_potenze_esp_negativo | Potenze con esponente negativo / Powers with a negative exponent | PROCEDURAL | 12–13 | L'esponente negativo come reciproco della base. / A negative exponent as the reciprocal of the base. |
| lyc_potenze_base_10 | Potenze di 10 e notazione scientifica / Powers of ten and scientific notation | REPRESENTATIONAL | 12–13 | Usare potenze di 10 e notazione scientifica. / Use powers of ten and scientific notation. |
| lyc_potenze_espressioni `T` | Espressioni con le potenze / Expressions with powers | PROCEDURAL | 12–14 | Risolvere espressioni applicando le proprietà delle potenze. / Solve expressions applying the properties of powers. |

### 1.2 DIVISIBILITÀ (7)

| id | name it / en | type | age | desc it / en |
| :-- | :-- | :-- | :-- | :-- |
| lyc_div_multipli_divisori | Multipli e divisori / Multiples and divisors | CONCEPTUAL | 11–12 | Distinguere multipli e divisori e la loro relazione. / Tell multiples and divisors apart and relate them. |
| lyc_div_criteri | Criteri di divisibilità / Divisibility rules | PROCEDURAL | 11–12 | Applicare i criteri per 2, 3, 4, 5, 9, 10, 11. / Apply the rules for 2, 3, 4, 5, 9, 10, 11. |
| lyc_div_primi_composti | Numeri primi e composti / Prime and composite numbers | CONCEPTUAL | 11–12 | Riconoscere numeri primi e composti. / Recognise prime and composite numbers. |
| lyc_div_scomposizione | Scomposizione in fattori primi / Prime factorisation | PROCEDURAL | 11–13 | Scomporre un numero nel prodotto dei suoi fattori primi. / Break a number into a product of prime factors. |
| lyc_div_mcd | Massimo Comune Divisore (MCD) / Greatest Common Divisor | PROCEDURAL | 12–13 | Calcolare il MCD dalla scomposizione. / Compute the GCD from the factorisation. |
| lyc_div_mcm | minimo comune multiplo (mcm) / Least Common Multiple | PROCEDURAL | 12–13 | Calcolare il mcm dalla scomposizione. / Compute the LCM from the factorisation. |
| lyc_div_mcm_mcd_problemi `T` | Problemi con mcm e MCD / Word problems with LCM and GCD | PROCEDURAL | 12–14 | Risolvere problemi scegliendo tra mcm e MCD. / Solve problems choosing between LCM and GCD. |

### 1.3 FRAZIONI E OPERAZIONI (10)

| id | name it / en | type | age | desc it / en |
| :-- | :-- | :-- | :-- | :-- |
| lyc_fraz_concetto | Concetto di frazione / Meaning of a fraction | CONCEPTUAL | 11–12 | La frazione come parte di un intero e come quoziente. / A fraction as part of a whole and as a quotient. |
| lyc_fraz_equivalenti | Frazioni equivalenti e riduzione / Equivalent fractions and simplification | PROCEDURAL | 11–12 | Riconoscere frazioni equivalenti e ridurre ai minimi termini. / Recognise equivalent fractions and reduce to lowest terms. |
| lyc_fraz_confronto | Confronto e ordinamento / Comparing and ordering | PROCEDURAL | 11–12 | Confrontare e ordinare frazioni con denominatore comune. / Compare and order fractions via a common denominator. |
| lyc_fraz_miste | Proprie, improprie, apparenti / Proper, improper, whole-valued | CONCEPTUAL | 11–12 | Distinguere frazioni proprie/improprie/apparenti e numeri misti. / Distinguish proper/improper/whole-valued fractions and mixed numbers. |
| lyc_fraz_add_sott | Addizione e sottrazione / Adding and subtracting | PROCEDURAL | 11–13 | Sommare/sottrarre frazioni col minimo comune denominatore. / Add/subtract fractions using the least common denominator. |
| lyc_fraz_molt | Moltiplicazione / Multiplying | PROCEDURAL | 11–13 | Moltiplicare frazioni e semplificare in croce. / Multiply fractions and cancel across. |
| lyc_fraz_div | Divisione / Dividing | PROCEDURAL | 12–13 | Dividere frazioni moltiplicando per il reciproco. / Divide by multiplying by the reciprocal. |
| lyc_fraz_potenza | Potenza di una frazione / Power of a fraction | PROCEDURAL | 12–13 | Elevare a potenza numeratore e denominatore. / Raise numerator and denominator to the power. |
| lyc_fraz_frazione_di | Frazione di un numero e inverso / Fraction of a number and its inverse | PROCEDURAL | 11–13 | Calcolare la frazione di una quantità e risalire all'intero. / Find a fraction of a quantity and recover the whole. |
| lyc_fraz_espressioni `T` | Espressioni con le frazioni / Expressions with fractions | PROCEDURAL | 12–14 | Risolvere espressioni con frazioni, parentesi e potenze. / Solve expressions with fractions, brackets and powers. |

### 1.4 RADICI (5)

| id | name it / en | type | age | desc it / en |
| :-- | :-- | :-- | :-- | :-- |
| lyc_radici_concetto | Radice quadrata come operazione inversa / Square root as inverse operation | CONCEPTUAL | 12–13 | La radice quadrata come inversa dell'elevamento al quadrato. / The square root as the inverse of squaring. |
| lyc_radici_quadrati_perfetti | Quadrati perfetti e radici esatte / Perfect squares and exact roots | PROCEDURAL | 12–13 | Riconoscere i quadrati perfetti e calcolarne la radice esatta. / Recognise perfect squares and find their exact root. |
| lyc_radici_stima | Stima e approssimazione / Estimating square roots | PROCEDURAL | 12–13 | Approssimare radici non esatte tra due interi e con le tavole. / Approximate non-exact roots between two integers and with tables. |
| lyc_radici_proprieta | Proprietà dei radicali / Properties of radicals | PROCEDURAL | 13–14 | Radice di prodotto e quoziente; semplificazione. / Root of a product and quotient; simplification. |
| lyc_radici_espressioni `T` | Espressioni con radici e potenze / Expressions with roots and powers | PROCEDURAL | 13–14 | Risolvere espressioni con radici e esponenti frazionari. / Solve expressions with roots and fractional exponents. |

### 1.5 EQUIVALENZE (7)

| id | name it / en | type | age | desc it / en |
| :-- | :-- | :-- | :-- | :-- |
| lyc_equiv_sistema_metrico | Sistema metrico decimale / Decimal metric system | CONCEPTUAL | 11–12 | Struttura decimale delle misure e ruolo delle potenze di 10. / Decimal structure of measures and the role of powers of ten. |
| lyc_equiv_lunghezze | Equivalenze di lunghezza / Length conversions | PROCEDURAL | 11–12 | Convertire lunghezze spostando la virgola. / Convert lengths by shifting the decimal point. |
| lyc_equiv_superfici | Equivalenze di superficie / Area conversions | PROCEDURAL | 12–13 | Convertire superfici ×/÷100 a ogni passo. / Convert areas ×/÷100 per step. |
| lyc_equiv_volumi_capacita | Equivalenze di volume e capacità / Volume and capacity conversions | PROCEDURAL | 12–13 | Convertire volumi ×/÷1000 e collegarli alle capacità (L, dm³). / Convert volumes ×/÷1000 and link to capacity (L, dm³). |
| lyc_equiv_massa | Equivalenze di massa / Mass conversions | PROCEDURAL | 11–12 | Convertire misure di massa e peso. / Convert units of mass and weight. |
| lyc_equiv_tempo | Misure di tempo non decimali / Non-decimal time measures | PROCEDURAL | 11–12 | Operare con ore, minuti, secondi (non decimali). / Work with hours, minutes, seconds (non-decimal). |
| lyc_equiv_problemi `T` | Problemi con le equivalenze / Problems mixing magnitudes | PROCEDURAL | 12–14 | Risolvere problemi che combinano grandezze diverse. / Solve problems combining different magnitudes. |

### 1.6 PIANO CARTESIANO (5)

| id | name it / en | type | age | desc it / en |
| :-- | :-- | :-- | :-- | :-- |
| lyc_piano_assi | Assi, origine e coordinate / Axes, origin and coordinates | CONCEPTUAL | 11–12 | Assi, origine, quadranti e coppie ordinate. / Axes, origin, quadrants and ordered pairs. |
| lyc_piano_punti | Rappresentare e leggere punti / Plotting and reading points | PROCEDURAL | 11–12 | Collocare e leggere punti nei quattro quadranti. / Plot and read points across all four quadrants. |
| lyc_piano_distanza | Distanza tra due punti / Distance between two points | PROCEDURAL | 12–14 | Distanza tra punti, anche con Pitagora. / Distance between points, including via Pythagoras. |
| lyc_piano_punto_medio | Punto medio di un segmento / Midpoint of a segment | PROCEDURAL | 12–14 | Coordinate del punto medio di un segmento. / Coordinates of the midpoint of a segment. |
| lyc_piano_figure `T` | Figure nel piano cartesiano / Figures on the Cartesian plane | PROCEDURAL | 12–14 | Disegnare poligoni e calcolarne perimetro e area. / Draw polygons and compute their perimeter and area. |

### 1.7 PERIMETRO E AREA DEI POLIGONI (11)

| id | name it / en | type | age | desc it / en |
| :-- | :-- | :-- | :-- | :-- |
| lyc_poli_classificazione | Classificazione dei poligoni / Classifying polygons | CONCEPTUAL | 11–12 | Classificare triangoli e quadrilateri; poligoni regolari. / Classify triangles and quadrilaterals; regular polygons. |
| lyc_perimetro | Perimetro dei poligoni / Perimeter of polygons | PROCEDURAL | 11–12 | Calcolare il perimetro sommando i lati. / Compute perimeter by adding sides. |
| lyc_area_concetto | Concetto di area e unità / Concept of area and units | CONCEPTUAL | 11–12 | L'area come misura della superficie e le sue unità. / Area as the measure of a surface and its units. |
| lyc_area_rettangolo_quadrato | Area di rettangolo e quadrato / Area of rectangle and square | PROCEDURAL | 11–12 | Area di rettangolo e quadrato. / Area of a rectangle and a square. |
| lyc_area_triangolo | Area del triangolo / Area of a triangle | PROCEDURAL | 11–13 | Area del triangolo (base × altezza / 2). / Area of a triangle (base × height / 2). |
| lyc_area_parallelogramma | Area di parallelogramma e rombo / Area of parallelogram and rhombus | PROCEDURAL | 11–13 | Area di parallelogramma e rombo. / Area of a parallelogram and a rhombus. |
| lyc_area_trapezio | Area del trapezio / Area of a trapezoid | PROCEDURAL | 12–13 | Area del trapezio. / Area of a trapezoid. |
| lyc_area_poligoni_regolari | Area dei poligoni regolari (apotema) / Area of regular polygons (apothem) | PROCEDURAL | 12–14 | Area dei poligoni regolari con l'apotema. / Area of regular polygons using the apothem. |
| lyc_cerchio | Circonferenza e area del cerchio / Circumference and area of a circle | PROCEDURAL | 12–14 | Circonferenza e area del cerchio con π. / Circumference and area of a circle using π. |
| lyc_area_composte | Aree di figure composte / Area of compound figures | PROCEDURAL | 12–14 | Area di figure scomponibili in poligoni noti. / Area of figures decomposable into known polygons. |
| lyc_area_problemi `T` | Problemi su perimetro e area / Perimeter and area problems | PROCEDURAL | 12–14 | Problemi con formule dirette e inverse. / Problems using direct and inverse formulas. |

### 1.8 TEOREMA DI PITAGORA (5)

| id | name it / en | type | age | desc it / en |
| :-- | :-- | :-- | :-- | :-- |
| lyc_pit_triangolo_rettangolo | Cateti e ipotenusa / Legs and hypotenuse | CONCEPTUAL | 12–13 | Riconoscere cateti e ipotenusa nel triangolo rettangolo. / Identify legs and hypotenuse in a right triangle. |
| lyc_pit_enunciato | Enunciato del teorema / Statement of the theorem | CONCEPTUAL | 12–13 | Il quadrato dell'ipotenusa = somma dei quadrati dei cateti. / The square on the hypotenuse = sum of the squares on the legs. |
| lyc_pit_terne | Terne pitagoriche / Pythagorean triples | PROCEDURAL | 12–14 | Riconoscere terne e verificare se un triangolo è rettangolo. / Recognise triples and test if a triangle is right-angled. |
| lyc_pit_calcolo_lati | Calcolo di ipotenusa e cateti / Computing hypotenuse and legs | PROCEDURAL | 12–14 | Formule dirette e inverse per i lati. / Direct and inverse formulas for the sides. |
| lyc_pit_applicazioni_figure `T` | Applicazioni ad altre figure / Applications to other figures | PROCEDURAL | 13–14 | Pitagora su rettangoli, triangoli isosceli, rombi, trapezi, piano cartesiano. / Pythagoras on rectangles, isosceles triangles, rhombi, trapezoids, the Cartesian plane. |

---

## 2. Dependency edges

`topicId` depends on `prerequisiteId`. Cross-cluster edges are marked (×). Verified acyclic; 60/60 reachable from targets.

### 2.1 Internal edges — POTENZE / DIVISIBILITÀ / FRAZIONI

| topicId | prerequisiteId | strength | reason |
| :-- | :-- | :-- | :-- |
| lyc_potenze_lettura | lyc_potenze_def | hard | serve la definizione per leggere/scrivere una potenza |
| lyc_potenze_particolari | lyc_potenze_def | hard | i casi esp. 0 e 1 derivano dalla definizione |
| lyc_potenze_prod_stessa_base | lyc_potenze_def | hard | la regola nasce dalla definizione di potenza |
| lyc_potenze_quoz_stessa_base | lyc_potenze_def | hard | richiede la definizione di potenza |
| lyc_potenze_quoz_stessa_base | lyc_potenze_prod_stessa_base | soft | il quoziente è simmetrico al prodotto |
| lyc_potenze_potenza_di_potenza | lyc_potenze_prod_stessa_base | hard | si ricava ripetendo il prodotto di potenze |
| lyc_potenze_prod_stesso_esp | lyc_potenze_def | hard | la regola nasce dalla definizione |
| lyc_potenze_esp_negativo | lyc_potenze_quoz_stessa_base | hard | l'esponente negativo emerge da a^m:a^n con m<n |
| lyc_potenze_esp_negativo | lyc_potenze_particolari | soft | collega esp. 0 al reciproco |
| lyc_potenze_base_10 | lyc_potenze_def | soft | le potenze di 10 sono un caso della definizione |
| lyc_potenze_base_10 | lyc_potenze_esp_negativo | soft | la notazione scientifica usa esponenti negativi |
| lyc_potenze_espressioni | lyc_potenze_prod_stessa_base | hard | l'espressione applica questa proprietà |
| lyc_potenze_espressioni | lyc_potenze_quoz_stessa_base | hard | l'espressione applica questa proprietà |
| lyc_potenze_espressioni | lyc_potenze_potenza_di_potenza | hard | l'espressione applica questa proprietà |
| lyc_potenze_espressioni | lyc_potenze_prod_stesso_esp | hard | l'espressione applica questa proprietà |
| lyc_potenze_espressioni | lyc_potenze_particolari | soft | ricorrono esp. 0 e 1 |
| lyc_potenze_espressioni | lyc_potenze_esp_negativo | soft | possono comparire esponenti negativi |
| lyc_potenze_espressioni | lyc_potenze_lettura | soft | serve leggere correttamente la notazione |
| lyc_potenze_espressioni | lyc_potenze_base_10 | soft | possono comparire potenze di 10 |
| lyc_div_criteri | lyc_div_multipli_divisori | hard | i criteri stabiliscono se un numero è divisore |
| lyc_div_primi_composti | lyc_div_multipli_divisori | hard | primo/composto si definisce contando i divisori |
| lyc_div_scomposizione | lyc_div_primi_composti | hard | serve riconoscere i primi per scomporre |
| lyc_div_scomposizione | lyc_div_criteri | soft | i criteri velocizzano la ricerca dei fattori |
| lyc_div_mcd | lyc_div_scomposizione | hard | il MCD si legge dalla scomposizione |
| lyc_div_mcm | lyc_div_scomposizione | hard | il mcm si legge dalla scomposizione |
| lyc_div_mcm_mcd_problemi | lyc_div_mcd | hard | il problema richiede il calcolo del MCD |
| lyc_div_mcm_mcd_problemi | lyc_div_mcm | hard | il problema richiede il calcolo del mcm |
| lyc_fraz_equivalenti | lyc_fraz_concetto | hard | l'equivalenza si fonda sul concetto di frazione |
| lyc_fraz_confronto | lyc_fraz_equivalenti | hard | si confronta portando a denominatore comune |
| lyc_fraz_miste | lyc_fraz_concetto | hard | numeri misti definiti dal concetto di frazione |
| lyc_fraz_add_sott | lyc_fraz_equivalenti | hard | servono frazioni equivalenti per il denom. comune |
| lyc_fraz_add_sott | lyc_div_mcm | soft (×) | il minimo comune denominatore è il mcm dei denominatori |
| lyc_fraz_molt | lyc_fraz_concetto | hard | prodotto di frazioni dal concetto |
| lyc_fraz_molt | lyc_fraz_equivalenti | soft | la semplificazione a croce usa l'equivalenza |
| lyc_fraz_div | lyc_fraz_molt | hard | dividere = moltiplicare per il reciproco |
| lyc_fraz_potenza | lyc_fraz_molt | hard | la potenza di frazione è un prodotto ripetuto |
| lyc_fraz_potenza | lyc_potenze_def | soft (×) | riusa la definizione di potenza |
| lyc_fraz_frazione_di | lyc_fraz_molt | hard | frazione di un numero = moltiplicazione |
| lyc_fraz_frazione_di | lyc_fraz_div | soft | il problema inverso usa la divisione |
| lyc_fraz_espressioni | lyc_fraz_add_sott | hard | l'espressione combina addizione/sottrazione |
| lyc_fraz_espressioni | lyc_fraz_molt | hard | l'espressione combina la moltiplicazione |
| lyc_fraz_espressioni | lyc_fraz_div | hard | l'espressione combina la divisione |
| lyc_fraz_espressioni | lyc_fraz_potenza | soft | possono comparire potenze di frazioni |
| lyc_fraz_espressioni | lyc_fraz_miste | soft | possono comparire numeri misti |
| lyc_fraz_espressioni | lyc_fraz_confronto | soft | talora serve confrontare risultati |
| lyc_fraz_espressioni | lyc_fraz_frazione_di | soft | possono comparire frazioni di quantità |

### 2.2 Internal edges — RADICI / EQUIVALENZE / PIANO / POLIGONI / PITAGORA

| topicId | prerequisiteId | strength | reason |
| :-- | :-- | :-- | :-- |
| lyc_radici_concetto | lyc_potenze_def | hard (×) | la radice è l'inversa dell'elevamento a potenza |
| lyc_radici_concetto | lyc_potenze_lettura | soft (×) | serve la notazione di quadrato |
| lyc_radici_quadrati_perfetti | lyc_radici_concetto | hard | la radice esatta dipende dal concetto |
| lyc_radici_stima | lyc_radici_quadrati_perfetti | hard | si stima tra due quadrati perfetti vicini |
| lyc_radici_proprieta | lyc_radici_quadrati_perfetti | hard | le proprietà si applicano su radici note |
| lyc_radici_proprieta | lyc_div_scomposizione | soft (×) | semplificare un radicale usa la scomposizione in fattori |
| lyc_radici_espressioni | lyc_radici_proprieta | hard | l'espressione applica le proprietà dei radicali |
| lyc_radici_espressioni | lyc_radici_stima | soft | talora serve stimare radici non esatte |
| lyc_radici_espressioni | lyc_potenze_esp_negativo | soft (×) | collega radici ed esponenti frazionari/negativi |
| lyc_equiv_sistema_metrico | lyc_potenze_base_10 | soft (×) | le equivalenze si basano sulle potenze di 10 |
| lyc_equiv_lunghezze | lyc_equiv_sistema_metrico | hard | conversioni dal sistema metrico |
| lyc_equiv_massa | lyc_equiv_sistema_metrico | hard | conversioni dal sistema metrico |
| lyc_equiv_tempo | lyc_equiv_sistema_metrico | soft | il tempo NON è decimale: contrasto col sistema metrico |
| lyc_equiv_superfici | lyc_equiv_lunghezze | hard | le unità di superficie derivano da lunghezza al quadrato |
| lyc_equiv_superfici | lyc_area_concetto | soft (×) | serve il concetto di area |
| lyc_equiv_volumi_capacita | lyc_equiv_lunghezze | hard | le unità di volume derivano da lunghezza al cubo |
| lyc_equiv_problemi | lyc_equiv_lunghezze | hard | i problemi usano lunghezze |
| lyc_equiv_problemi | lyc_equiv_superfici | hard | i problemi usano superfici |
| lyc_equiv_problemi | lyc_equiv_volumi_capacita | hard | i problemi usano volumi/capacità |
| lyc_equiv_problemi | lyc_equiv_massa | soft | possono comparire masse |
| lyc_equiv_problemi | lyc_equiv_tempo | soft | possono comparire tempi |
| lyc_piano_punti | lyc_piano_assi | hard | i punti si collocano rispetto agli assi |
| lyc_piano_distanza | lyc_piano_punti | hard | la distanza opera su punti dati |
| lyc_piano_distanza | lyc_pit_calcolo_lati | soft (×) | la distanza generale si calcola con Pitagora |
| lyc_piano_punto_medio | lyc_piano_punti | hard | il punto medio opera su punti dati |
| lyc_piano_figure | lyc_piano_punti | hard | le figure sono insiemi di punti |
| lyc_piano_figure | lyc_piano_distanza | hard | servono le distanze per lati/perimetro |
| lyc_piano_figure | lyc_piano_punto_medio | soft | talora serve il punto medio |
| lyc_piano_figure | lyc_perimetro | soft (×) | riusa il concetto di perimetro |
| lyc_perimetro | lyc_poli_classificazione | soft | serve riconoscere il poligono |
| lyc_area_concetto | lyc_poli_classificazione | soft | serve riconoscere la figura |
| lyc_area_rettangolo_quadrato | lyc_area_concetto | hard | l'area di base dal concetto di area |
| lyc_area_triangolo | lyc_area_rettangolo_quadrato | hard | il triangolo è metà rettangolo |
| lyc_area_parallelogramma | lyc_area_rettangolo_quadrato | hard | il parallelogramma si trasforma in rettangolo |
| lyc_area_trapezio | lyc_area_triangolo | hard | il trapezio si scompone in triangoli |
| lyc_area_trapezio | lyc_area_parallelogramma | soft | via alternativa per il trapezio |
| lyc_area_poligoni_regolari | lyc_area_triangolo | hard | il poligono regolare si scompone in triangoli |
| lyc_area_poligoni_regolari | lyc_perimetro | soft | area = perimetro × apotema / 2 |
| lyc_cerchio | lyc_area_concetto | hard | l'area del cerchio dal concetto di area |
| lyc_area_composte | lyc_area_rettangolo_quadrato | hard | scomposizione in rettangoli |
| lyc_area_composte | lyc_area_triangolo | hard | scomposizione in triangoli |
| lyc_area_composte | lyc_area_trapezio | soft | scomposizione in trapezi |
| lyc_area_composte | lyc_cerchio | soft | figure con parti circolari |
| lyc_area_problemi | lyc_perimetro | hard | i problemi usano il perimetro |
| lyc_area_problemi | lyc_area_composte | hard | i problemi usano figure composte |
| lyc_area_problemi | lyc_area_poligoni_regolari | soft | possono comparire poligoni regolari |
| lyc_area_problemi | lyc_cerchio | soft | possono comparire cerchi |
| lyc_area_problemi | lyc_area_trapezio | soft | possono comparire trapezi |
| lyc_pit_enunciato | lyc_pit_triangolo_rettangolo | hard | il teorema riguarda il triangolo rettangolo |
| lyc_pit_enunciato | lyc_potenze_lettura | soft (×) | il teorema usa i quadrati dei lati |
| lyc_pit_enunciato | lyc_area_rettangolo_quadrato | soft (×) | interpretazione con le aree dei quadrati sui lati |
| lyc_pit_terne | lyc_pit_enunciato | hard | le terne verificano l'enunciato |
| lyc_pit_calcolo_lati | lyc_pit_enunciato | hard | il calcolo applica l'enunciato |
| lyc_pit_calcolo_lati | lyc_radici_concetto | hard (×) | per trovare un lato serve la radice quadrata |
| lyc_pit_calcolo_lati | lyc_radici_quadrati_perfetti | soft (×) | molte soluzioni sono radici esatte |
| lyc_pit_applicazioni_figure | lyc_pit_calcolo_lati | hard | le applicazioni riusano il calcolo dei lati |
| lyc_pit_applicazioni_figure | lyc_pit_terne | soft | le terne semplificano molte applicazioni |
| lyc_pit_applicazioni_figure | lyc_area_triangolo | soft (×) | altezze di triangoli isosceli/equilateri |
| lyc_pit_applicazioni_figure | lyc_poli_classificazione | soft (×) | serve riconoscere le figure |
| lyc_pit_applicazioni_figure | lyc_piano_distanza | soft (×) | distanza nel piano cartesiano come applicazione |

### 2.3 Anchor edges into os-taxonomy (50 edges → 44 real `mt_` IDs, all verified present)

Each `mt_` name is quoted verbatim from topics.json.

| lyc topicId | prerequisite mt_ id | os-taxonomy name (verbatim) | strength | reason |
| :-- | :-- | :-- | :-- | :-- |
| lyc_potenze_def | mt_PZ909yPrEC | "Multiplication as repeated addition" | hard | la potenza estende la moltiplicazione ripetuta |
| lyc_potenze_def | mt_gxCIASSezX | "Square and cube numbers" | soft | quadrati e cubi sono le prime potenze |
| lyc_potenze_lettura | mt_hCVPYlF-7Y | "Square and cube numbers" | soft | notazione di quadrato/cubo (11–14) |
| lyc_potenze_espressioni | mt_jHgRQ4hR0g | "Order of operations" | hard | le espressioni richiedono la gerarchia delle operazioni |
| lyc_potenze_base_10 | mt_HLUqHJ9Y7n | "Patterns with Powers of Ten" | hard | pattern delle potenze di 10 |
| lyc_potenze_base_10 | mt_bO-njVOige | "Powers of Ten Notation" | soft | notazione con potenze di 10 |
| lyc_potenze_esp_negativo | mt_9QzSnn8m80 | "Positive and Negative Numbers" | soft | serve il concetto di numero negativo |
| lyc_potenze_esp_negativo | mt_rxInpOQ74w | "Sign Rules for Multiplication" | soft | gestione dei segni |
| lyc_div_multipli_divisori | mt_HhuSDxwDNM | "Times tables" | hard | i multipli sono le tabelline |
| lyc_div_multipli_divisori | mt_iNdrM2-oJf | "What Division Means" | hard | divisore = divisione esatta |
| lyc_div_multipli_divisori | mt_nZkL5-XjRX | "Factor Pairs & Commutativity" | soft | coppie di fattori |
| lyc_div_multipli_divisori | mt_K5jM7vlVhA | "All times tables to 12x12" | soft | padronanza delle tabelline |
| lyc_div_primi_composti | mt_y1XCVsIelg | "Prime numbers" | hard | definizione di numero primo |
| lyc_div_scomposizione | mt_FHIAv6dfhU | "Factors, multiples, and primes" | hard | fattori, multipli e primi |
| lyc_fraz_concetto | mt_vKcxX6iNOA | "Fraction Notation" | hard | notazione di frazione |
| lyc_fraz_concetto | mt_wB-GBDkoNr | "Decimals and fractions" | soft | collegamento frazioni–decimali |
| lyc_fraz_equivalenti | mt_FbDKeLfBCo | "Equivalent fractions" | hard | base delle frazioni equivalenti |
| lyc_fraz_equivalenti | mt_b7T-CjOYUR | "Simplifying Fractions" | hard | riduzione ai minimi termini |
| lyc_fraz_add_sott | mt_14T5yPXUq_ | "Adding Fractions (Unlike Denominators)" | hard | addizione con denominatori diversi |
| lyc_fraz_div | mt_9Y96vxG_LH | "Dividing fractions" | soft | base della divisione tra frazioni |
| lyc_fraz_miste | mt_o_p-3tCxiM | "Mixed numbers and improper fractions" | hard | numeri misti e frazioni improprie |
| lyc_radici_concetto | mt_gxCIASSezX | "Square and cube numbers" | hard | la radice inverte il quadrato |
| lyc_radici_quadrati_perfetti | mt_hCVPYlF-7Y | "Square and cube numbers" | hard | i quadrati perfetti sono quadrati di interi |

| lyc_equiv_sistema_metrico | mt_EDgw64OmfA | "Place Value x 10 and / 10" | hard | spostare la virgola per x/:10 |
| lyc_equiv_lunghezze | mt_d8al9JcajP | "Converting measurement units" | hard | conversione di unità di misura |
| lyc_equiv_lunghezze | mt_SqhXQhAEUf | "Measurement Conversions" | hard | conversioni di misura |
| lyc_equiv_tempo | mt_EXlmTURK_o | "Time Units and Calendar Facts" | soft | unità di tempo |
| lyc_equiv_massa | mt_-af65bxfdp | "Measuring Liquids & Masses" | soft | misure di massa e liquidi |
| lyc_equiv_volumi_capacita | mt_5TBUFnCy5- | "Volume as additive" | soft | concetto di volume |
| lyc_piano_assi | mt_jBQS-CicNn | "First Quadrant Coordinates" | hard | coordinate nel primo quadrante |
| lyc_piano_assi | mt_R4AY0LKxfl | "Coordinates (age 10+)" | hard | uso delle coordinate |
| lyc_piano_assi | mt_9QzSnn8m80 | "Positive and Negative Numbers" | hard | servono i negativi per i 4 quadranti |
| lyc_piano_punti | mt_hVpGOEz2kG | "Coordinates (age 11+)" | soft | coordinate a 11+ |
| lyc_piano_punti | mt_snlqRCiA1R | "Plotting points in the first quadrant" | soft | tracciare punti |
| lyc_piano_figure | mt_y-BuQAfw4B | "Coordinates (age 12+)" | soft | coordinate a 12+ |
| lyc_poli_classificazione | mt_DNYQLahbfa | "Properties of triangles and quadrilaterals" | hard | proprietà di triangoli e quadrilateri |
| lyc_poli_classificazione | mt_8H2kO4k2B9 | "Regular and irregular polygons" | soft | poligoni regolari e irregolari |
| lyc_perimetro | mt_WtcFrxGOgw | "Perimeters of polygons" | hard | perimetro dei poligoni |
| lyc_perimetro | mt_MJZA90uc6H | "Perimeter (age 10+)" | soft | perimetro a 10+ |
| lyc_area_concetto | mt_6xNmQLzuqm | "Understanding Area" | hard | concetto di area |
| lyc_area_rettangolo_quadrato | mt_y1n0Zwhoca | "Area (age 8+)" | hard | area di base per conteggio |
| lyc_area_triangolo | mt_ML5t7n2-U8 | "Area of Triangles & Parallelograms" | hard | area di triangoli |
| lyc_area_parallelogramma | mt_ML5t7n2-U8 | "Area of Triangles & Parallelograms" | soft | area di parallelogrammi |
| lyc_cerchio | mt_svFa6_mjO_ | "Circles: Circumference & Area" | hard | circonferenza e area del cerchio |
| lyc_cerchio | mt_xq3YHZ2zeR | "Parts of a circle" | soft | parti del cerchio |
| lyc_area_composte | mt_eMtV6tBSJm | "Area of compound shapes" | soft | aree di figure composte |
| lyc_pit_triangolo_rettangolo | mt_MFfYcnv6Tv | "Right Angles & Turns" | hard | l'angolo retto definisce il triangolo rettangolo |
| lyc_pit_triangolo_rettangolo | mt_tAJH5BrpOx | "Angles in triangles (age 11+)" | soft | angoli nei triangoli |
| lyc_pit_triangolo_rettangolo | mt_DNYQLahbfa | "Properties of triangles and quadrilaterals" | soft | proprietà dei triangoli |
| lyc_pit_enunciato | mt_hCVPYlF-7Y | "Square and cube numbers" | soft | il teorema usa i quadrati |

> Note: names for `mt_K5jM7vlVhA` ("All times tables to 12×12") and `mt_EDgw64OmfA` ("Place Value ×10 and ÷10") contain × / ÷ symbols; rendered here as x / / to avoid encoding drift. The `mt_` IDs are authoritative.

---

## 3. Fully-worked exemplar topics

`centrality` is an extension-local heuristic in [0,1] (higher = more prerequisite-central within math-it-media), not the os-taxonomy global value. `standards` left `[]` (ministerial mapping to Indicazioni Nazionali 2012 is a later pass; not fabricated here).

### 3.1 `lyc_potenze_def` (CONCEPTUAL)

```json
{
  "id": "lyc_potenze_def",
  "type": "CONCEPTUAL",
  "subject": "Mathematics",
  "domain": "Powers & Roots",
  "name": {
    "it": "Definizione di potenza",
    "en": "Definition of a power"
  },
  "description": {
    "it": "La potenza a^n come prodotto di n fattori tutti uguali alla base a (con n intero maggiore di 1); saper individuare base, esponente e valore della potenza e collegare la potenza alla moltiplicazione ripetuta.",
    "en": "The power a^n as the product of n factors all equal to the base a (for integer n greater than 1); identifying base, exponent and the value of the power, and linking a power to repeated multiplication."
  },
  "ageRangeStart": 11,
  "ageRangeEnd": 12,
  "centrality": 0.7,
  "evidence": {
    "it": [
      "Data una potenza (es. 2^5), {{name}} indica correttamente qual è la base e quale l'esponente.",
      "Riscrive una potenza come prodotto di fattori uguali e viceversa (es. 2^4 = 2x2x2x2 = 16).",
      "Spiega perché 2^3 e 3^2 danno risultati diversi, distinguendo il ruolo di base ed esponente."
    ],
    "en": [
      "Given a power (e.g. 2^5), {{name}} correctly states which number is the base and which is the exponent.",
      "Rewrites a power as a product of equal factors and back (e.g. 2^4 = 2x2x2x2 = 16).",
      "Explains why 2^3 and 3^2 give different results, distinguishing the roles of base and exponent."
    ]
  },
  "assessmentPrompt": {
    "it": "{{name}} sa spiegare che cos'è una potenza come 2^5, indicando base ed esponente e calcolandone il valore come prodotto ripetuto?",
    "en": "Can {{name}} explain what a power such as 2^5 means, naming the base and exponent and working out its value as a repeated product?"
  },
  "standards": [],
  "prerequisites": [
    {"prerequisiteId": "mt_PZ909yPrEC", "strength": "hard", "reason": "la potenza estende la moltiplicazione ripetuta"},
    {"prerequisiteId": "mt_gxCIASSezX", "strength": "soft", "reason": "quadrati e cubi sono le prime potenze"}
  ]
}
```

### 3.2 `lyc_pit_calcolo_lati` (PROCEDURAL)

```json
{
  "id": "lyc_pit_calcolo_lati",
  "type": "PROCEDURAL",
  "subject": "Mathematics",
  "domain": "Geometry",
  "name": {
    "it": "Calcolo di ipotenusa e cateti",
    "en": "Computing the hypotenuse and the legs"
  },
  "description": {
    "it": "Applicare le formule diretta e inverse del teorema di Pitagora per calcolare l'ipotenusa (c = radice(a^2 + b^2)) o un cateto (a = radice(c^2 - b^2)) di un triangolo rettangolo, scegliendo la formula in base al lato incognito.",
    "en": "Apply the direct and inverse forms of the Pythagorean theorem to compute the hypotenuse (c = sqrt(a^2 + b^2)) or a leg (a = sqrt(c^2 - b^2)) of a right triangle, choosing the formula according to the unknown side."
  },
  "ageRangeStart": 12,
  "ageRangeEnd": 14,
  "centrality": 0.45,
  "evidence": {
    "it": [
      "Dati i due cateti, {{name}} calcola l'ipotenusa applicando c = radice(a^2 + b^2).",
      "Dati l'ipotenusa e un cateto, calcola l'altro cateto con la formula inversa a = radice(c^2 - b^2).",
      "Sceglie correttamente la formula diretta o inversa in base al lato incognito e arrotonda in modo sensato le radici non esatte."
    ],
    "en": [
      "Given the two legs, {{name}} computes the hypotenuse using c = sqrt(a^2 + b^2).",
      "Given the hypotenuse and one leg, computes the other leg with the inverse formula a = sqrt(c^2 - b^2).",
      "Correctly chooses the direct or inverse formula depending on the unknown side and rounds non-exact roots sensibly."
    ]
  },
  "assessmentPrompt": {
    "it": "Dato un triangolo rettangolo con i cateti di 3 cm e 4 cm, {{name}} sa calcolare la lunghezza dell'ipotenusa? E conoscendo l'ipotenusa (5 cm) e un cateto (3 cm), sa trovare l'altro cateto?",
    "en": "Given a right triangle with legs of 3 cm and 4 cm, can {{name}} work out the length of the hypotenuse? And knowing the hypotenuse (5 cm) and one leg (3 cm), can they find the other leg?"
  },
  "standards": [],
  "prerequisites": [
    {"prerequisiteId": "lyc_pit_enunciato", "strength": "hard", "reason": "il calcolo applica l'enunciato del teorema"},
    {"prerequisiteId": "lyc_radici_concetto", "strength": "hard", "reason": "per trovare un lato serve la radice quadrata"},
    {"prerequisiteId": "lyc_radici_quadrati_perfetti", "strength": "soft", "reason": "molte soluzioni sono radici esatte"}
  ]
}
```

---

## 4. Curated resource records

Seeded manually from the Risorse report mapping table. 2–3 alternatives per cluster covering video + exercises + assessment. Real URLs used where the report gives them (works-cited list), else provider homepage.

```json
[
  {"id":"res_pot_v1","topicIds":["lyc_potenze_def","lyc_potenze_prod_stessa_base"],"kind":"video","provider":"Matematicale","title":{"it":"Le potenze e le loro proprietà","en":"Powers and their properties"},"url":"https://www.youtube.com/c/matematicale","lang":"it"},
  {"id":"res_pot_v2","topicIds":["lyc_potenze_def"],"kind":"video","provider":"Khan Academy","title":{"it":"Introduzione agli esponenti","en":"Introduction to exponents"},"url":"https://it.khanacademy.org/math/pre-algebra/pre-algebra-exponents-radicals/pre-algebra-exponents/v/introduction-to-exponents","lang":"it"},
  {"id":"res_pot_e1","topicIds":["lyc_potenze_espressioni"],"kind":"exercises","provider":"UbiMath","title":{"it":"Espressioni con le proprietà delle potenze (PDF)","en":"Expressions with the properties of powers (PDF)"},"url":"https://www.ubimath.org/potenze/ElevamentoAPotenza_Espressioni_ConProprietaIntermediate_UbiMath.pdf","lang":"it"},
  {"id":"res_pot_e2","topicIds":["lyc_potenze_esp_negativo"],"kind":"exercises","provider":"WeSchool","title":{"it":"Potenze con esponente negativo: spiegazione ed esercizi","en":"Powers with a negative exponent: explanation and exercises"},"url":"https://library.weschool.com/lezione/potenze-con-esponente-negativo-spiegazione-ed-esercizi-2396.html","lang":"it"},
  {"id":"res_pot_a1","topicIds":["lyc_potenze_espressioni","lyc_potenze_prod_stessa_base"],"kind":"assessment","provider":"Wordwall","title":{"it":"Quiz sulle potenze","en":"Quiz on powers"},"url":"https://wordwall.net/it/resource/7123861/matematica/quiz-sulle-potenze","lang":"it"},
  {"id":"res_div_v1","topicIds":["lyc_div_scomposizione","lyc_div_mcm","lyc_div_mcd"],"kind":"video","provider":"Matematica delle Medie","title":{"it":"Scomposizione, MCD e mcm","en":"Prime factorisation, GCD and LCM"},"url":"https://www.youtube.com/@matematicadellemedie","lang":"it"},
  {"id":"res_div_v2","topicIds":["lyc_div_multipli_divisori"],"kind":"video","provider":"Schooltoon","title":{"it":"Multipli e divisori (cartoni animati)","en":"Multiples and divisors (animated)"},"url":"https://schooltoon.com/lezioni-per-le-medie/","lang":"it"},
  {"id":"res_div_e1","topicIds":["lyc_div_scomposizione","lyc_div_mcm_mcd_problemi"],"kind":"exercises","provider":"UbiMath","title":{"it":"Ripasso: divisibilità e scomposizione","en":"Review: divisibility and factorisation"},"url":"https://www.ubimath.org/ripasso/","lang":"it"},
  {"id":"res_div_a1","topicIds":["lyc_div_criteri"],"kind":"assessment","provider":"Khan Academy","title":{"it":"Riconoscere la divisibilità","en":"Recognising divisibility"},"url":"https://it.khanacademy.org/math/pre-algebra/pre-algebra-factors-multiples/pre-algebra-divisibility-tests/v/recognizing-divisibility","lang":"it"},
  {"id":"res_fraz_v1","topicIds":["lyc_fraz_concetto"],"kind":"video","provider":"Schooltoon","title":{"it":"Che cos'è una frazione","en":"What is a fraction"},"url":"https://www.youtube.com/watch?v=tP31VhRw6Eg","lang":"it"},
  {"id":"res_fraz_v2","topicIds":["lyc_fraz_espressioni"],"kind":"video","provider":"Matematicale","title":{"it":"Espressioni con le frazioni","en":"Expressions with fractions"},"url":"https://www.youtube.com/c/matematicale","lang":"it"},
  {"id":"res_fraz_e1","topicIds":["lyc_fraz_espressioni"],"kind":"exercises","provider":"YouMath","title":{"it":"Esercizi di matematica: frazioni","en":"Maths exercises: fractions"},"url":"https://www.youmath.it/esercizi.html","lang":"it"},
  {"id":"res_fraz_a1","topicIds":["lyc_fraz_add_sott"],"kind":"assessment","provider":"Khan Academy","title":{"it":"Aritmetica: verifica sulle frazioni","en":"Arithmetic: fractions check"},"url":"https://it.khanacademy.org/math/arithmetic","lang":"it"},
  {"id":"res_rad_v1","topicIds":["lyc_radici_concetto","lyc_radici_proprieta"],"kind":"video","provider":"Matematicale","title":{"it":"Introduzione ai radicali","en":"Introduction to radicals"},"url":"https://www.youtube.com/c/matematicale","lang":"it"},
  {"id":"res_rad_e1","topicIds":["lyc_radici_espressioni"],"kind":"exercises","provider":"WeSchool","title":{"it":"Potenze con esponente frazionario: esercizi","en":"Powers with fractional exponent: exercises"},"url":"https://library.weschool.com/lezione/potenze-con-esponente-frazionario-definizione-ed-esercizi-2397.html","lang":"it"},
  {"id":"res_rad_a1","topicIds":["lyc_radici_quadrati_perfetti","lyc_radici_espressioni"],"kind":"assessment","provider":"UbiMath","title":{"it":"Test: estrazione di radice quadrata","en":"Test: square-root extraction"},"url":"https://www.ubimath.org/ripasso/","lang":"it"},
  {"id":"res_eq_v1","topicIds":["lyc_equiv_lunghezze"],"kind":"video","provider":"Khan Academy","title":{"it":"Conversione tra unità di misura","en":"Converting between measurement units"},"url":"https://it.khanacademy.org/math/arithmetic","lang":"it"},
  {"id":"res_eq_e1","topicIds":["lyc_equiv_lunghezze","lyc_equiv_superfici"],"kind":"exercises","provider":"Sieteprontianavigare","title":{"it":"Giochi interattivi sulle equivalenze","en":"Interactive games on unit conversions"},"url":"https://www.sieteprontianavigare.it/PORTOMATE/giochi_di_matematica.htm","lang":"it"},
  {"id":"res_eq_e2","topicIds":["lyc_equiv_problemi"],"kind":"exercises","provider":"UbiMath","title":{"it":"Ripasso: misure e scale","en":"Review: measures and scales"},"url":"https://www.ubimath.org/ripasso/","lang":"it"},
  {"id":"res_eq_a1","topicIds":["lyc_equiv_problemi"],"kind":"assessment","provider":"Redooc","title":{"it":"Test d'ingresso con le unità di misura","en":"Entry test with units of measure"},"url":"https://www.mamamo.it/educazione-digitale/scuola/test-dingresso-di-prima-media-e-prima-superiore-con-redooc/","lang":"it"},
  {"id":"res_piano_v1","topicIds":["lyc_piano_assi","lyc_piano_punti"],"kind":"video","provider":"Full Mind","title":{"it":"Piano cartesiano: tutte le basi","en":"Cartesian plane: all the basics"},"url":"https://www.youtube.com/watch?v=dlwt5lGjV1Y","lang":"it"},
  {"id":"res_piano_v2","topicIds":["lyc_piano_figure"],"kind":"video","provider":"Full Mind","title":{"it":"Piano cartesiano: esercizi su triangoli e quadrilateri","en":"Cartesian plane: exercises on triangles and quadrilaterals"},"url":"https://www.youtube.com/watch?v=mfL7HXtL_Cw","lang":"it"},
  {"id":"res_piano_e1","topicIds":["lyc_piano_punti"],"kind":"exercises","provider":"Khan Academy","title":{"it":"Rappresentazione di punti sul piano","en":"Plotting points on the plane"},"url":"https://it.khanacademy.org/math/cc-fifth-grade-math/cc-5th-geometry-topic/cc-5th-coordinate-plane/v/graphing-points-exercise","lang":"it"},
  {"id":"res_piano_a1","topicIds":["lyc_piano_distanza","lyc_piano_figure"],"kind":"assessment","provider":"GeoGebra","title":{"it":"Costruzioni e verifiche sul piano cartesiano","en":"Constructions and checks on the Cartesian plane"},"url":"https://www.geogebra.org/","lang":"it"},
  {"id":"res_poli_v1","topicIds":["lyc_area_concetto","lyc_perimetro"],"kind":"video","provider":"Didattica.live","title":{"it":"Videolezioni sulle formule geometriche","en":"Video lessons on geometric formulas"},"url":"https://didattica.live/medie/seconda/matematica/esercizi","lang":"it"},
  {"id":"res_poli_v2","topicIds":["lyc_cerchio"],"kind":"video","provider":"Khan Academy","title":{"it":"Cerchio: raggio, diametro, circonferenza e area","en":"Circle: radius, diameter, circumference and area"},"url":"https://it.khanacademy.org/math/algebra-basics/basic-alg-foundations","lang":"it"},
  {"id":"res_poli_e1","topicIds":["lyc_area_problemi"],"kind":"exercises","provider":"Matematicamente","title":{"it":"Problemi di geometria svolti (II media)","en":"Worked geometry problems (2nd year)"},"url":"https://www.matematicamente.it/esercizi-svolti/problemi-di-ii-media/","lang":"it"},
  {"id":"res_poli_a1","topicIds":["lyc_area_problemi"],"kind":"assessment","provider":"Didattica.live","title":{"it":"Quiz riassuntivi sulle aree dei poligoni","en":"Summary quizzes on polygon areas"},"url":"https://didattica.live/medie/seconda/matematica/esercizi","lang":"it"},
  {"id":"res_pit_v1","topicIds":["lyc_pit_enunciato"],"kind":"video","provider":"Schooltoon","title":{"it":"Il teorema di Pitagora (lezione animata)","en":"The Pythagorean theorem (animated lesson)"},"url":"https://www.youtube.com/watch?v=cjg-fg-LvLg","lang":"it"},
  {"id":"res_pit_v2","topicIds":["lyc_pit_enunciato","lyc_pit_calcolo_lati"],"kind":"video","provider":"Khan Academy","title":{"it":"Introduzione al teorema di Pitagora","en":"Introduction to the Pythagorean theorem"},"url":"https://it.khanacademy.org/math/cc-eighth-grade-math/cc-8th-geometry/cc-8th-pythagorean-theorem/v/the-pythagorean-theorem","lang":"it"},
  {"id":"res_pit_e1","topicIds":["lyc_pit_applicazioni_figure"],"kind":"exercises","provider":"GeoGebra","title":{"it":"Il teorema di Pitagora con GeoGebra (schede Zanichelli)","en":"The Pythagorean theorem with GeoGebra (Zanichelli sheets)"},"url":"https://online.scuola.zanichelli.it/contaci-files/Geogebra/Misure_spazio%20e%20figure2_cap02.pdf","lang":"it"},
  {"id":"res_pit_e2","topicIds":["lyc_pit_applicazioni_figure"],"kind":"exercises","provider":"UbiMath","title":{"it":"Schede operative sul teorema di Pitagora","en":"Worksheets on the Pythagorean theorem"},"url":"https://www.ubimath.org/ripasso/","lang":"it"},
  {"id":"res_pit_a1","topicIds":["lyc_pit_calcolo_lati","lyc_pit_applicazioni_figure"],"kind":"assessment","provider":"Wordwall","title":{"it":"Quiz sul teorema di Pitagora","en":"Quiz on the Pythagorean theorem"},"url":"https://wordwall.net/it/resource/2802352/teorema-di-pitagora","lang":"it"}
]
```

---

## 5. Coverage, gaps and design notes

### 5.1 Professor topics — full coverage

All 8 assigned topics are covered: POTENZE (10 micro), DIVISIBILITÀ (7) including multipli/divisori, criteri, primi/composti, scomposizione, mcm, MCD; FRAZIONI E OPERAZIONI (10) with the four operations + powers + expressions; RADICI (5); EQUIVALENZE (7) across length/area/volume/capacity/mass/time; PIANO CARTESIANO (5); PERIMETRO E AREA DEI POLIGONI (11); TEOREMA DI PITAGORA E APPLICAZIONI (5, apex = applications to other figures).

### 5.2 Gaps found in os-taxonomy (verified by keyword scan of all 1590 topics)

- **No square-root / radical topic exists.** RADICI is anchored to `mt_gxCIASSezX` / `mt_hCVPYlF-7Y` "Square and cube numbers" as the *inverse* relationship; the root operation itself is novel extension content. Concern: the diagnostic cannot descend below "square numbers" for radicals — acceptable, as square numbers is the true prerequisite.
- **No Pythagorean-theorem topic exists** (only `mt_...` "Types of angles (age 13+)" mentions Pythagoras in passing). TEOREMA DI PITAGORA is the extension's apex; it anchors to squares, right angles (`mt_MFfYcnv6Tv`), and triangle properties (`mt_DNYQLahbfa`).
- **No exponent/index-notation topic** beyond "Square and cube numbers", "Patterns with Powers of Ten" and "Powers of Ten Notation". POTENZE laws are novel content anchored to those plus `mt_jHgRQ4hR0g` "Order of operations".
- These three are expected: os-taxonomy's math tops out around ages 11–14 with UK-style coverage; the Italian 2ª-media radicals/Pythagoras layer is exactly what this extension adds.

### 5.3 Cross-cluster edges (learning-frontier glue)

FRAZIONI→DIV (mcm for common denominator); RADICI→POTENZE (inverse) and →DIV (simplifying radicals); POTENZE→(EQUIVALENZE via powers of ten); PIANO↔PITAGORA (distance uses Pythagoras; Pythagoras application includes Cartesian distance — verified acyclic); PITAGORA→RADICI, →POTENZE, →POLIGONI; EQUIVALENZE→POLIGONI (area concept). These let the diagnostic cross from any target into foundational gaps in another cluster.

### 5.4 Note on `lyc_potenze_base_10`

Its natural downstream consumer is EQUIVALENZE; a soft edge `lyc_potenze_espressioni ← lyc_potenze_base_10` was added so the POTENZE target self-covers its own cluster (otherwise `base_10` is only reachable via the EQUIVALENZE target — still globally reachable, 60/60).
