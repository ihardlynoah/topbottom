// Common fanfiction characters and the other names they go by, grouped by fandom.
//
// Format: a line starting with "@" opens a fandom: "@ id | regex matching the AO3 fandom tag".
// Each indented line after it is a character: "Name | m/f | alias; alias; …".
// Only list names that identify one character within the fandom: shared surnames ("Weasley", "Winchester") are left
// out because the tags already provide them. Titles, nicknames, alter egos and spelling variants are what's listed.

export const CANON_RAW = `
@ supernatural | supernatural
  Dean Winchester | m | Dean
  Sam Winchester | m | Sam; Sammy
  Castiel | m | Cas; Novak; Clarence
  Gabriel | m | Gabe; Trickster
  Crowley | m | Fergus
  Lucifer | m | Luci; Morningstar
  Bobby Singer | m | Bobby
  Charlie Bradbury | f | Charlie
  Benny Lafitte | m | Benny
  Jack Kline | m | Jack
  Rowena MacLeod | f | Rowena
  Meg Masters | f | Meg
  Jo Harvelle | f | Jo
  Ellen Harvelle | f | Ellen

@ harry-potter | harry potter|hogwarts|fantastic beasts
  Harry Potter | m | Harry
  Hermione Granger | f | Hermione; Mione
  Ron Weasley | m | Ron; Ronald; Won-Won
  Draco Malfoy | m | Draco; Dray
  Tom Riddle | m | Tom; Voldemort; Lord Voldemort; Dark Lord; Tom Marvolo Riddle
  Severus Snape | m | Severus; Sev; Snape
  Sirius Black | m | Sirius; Padfoot
  Remus Lupin | m | Remus; Moony; Lupin
  James Potter | m | Prongs
  Lily Evans | f | Lily
  Albus Dumbledore | m | Albus; Dumbledore
  Lucius Malfoy | m | Lucius
  Narcissa Malfoy | f | Narcissa
  Bellatrix Lestrange | f | Bellatrix; Bella
  Neville Longbottom | m | Neville
  Luna Lovegood | f | Luna
  Ginny Weasley | f | Ginny; Ginevra
  Fred Weasley | m | Fred
  George Weasley | m | George
  Cedric Diggory | m | Cedric
  Blaise Zabini | m | Blaise; Zabini
  Theodore Nott | m | Theo
  Pansy Parkinson | f | Pansy
  Minerva McGonagall | f | Minerva; McGonagall
  Peter Pettigrew | m | Wormtail
  Gellert Grindelwald | m | Gellert; Grindelwald
  Newt Scamander | m | Newt; Scamander
  Credence Barebone | m | Credence

@ captive-prince | captive prince
  Damen | m | Damianos; Damen of Akielos; Damianos of Akielos; Damen Akielon
  Laurent | m | Laurent de Vere; Laurent of Vere; Lau
  Auguste | m | Auguste of Vere
  Nikandros | m | Nik; Kyros
  Kastor | m | Kas; Kastor of Akielos
  Jokaste | f | Jokaste of Akielos
  Nicaise | m | Nic
  Aimeric | m | Aimeric of Fortaine
  Jord | m | Jord
  Pallas | m | Pallas
  Lazar | m | Lazar
  Erasmus | m | Erasmus
  Guion | m | Guion
  Govart | m | Govart
  Charls | m | Charls
  Theomedes | m | Theomedes
  Ancel | m | Ancel
  Hendric | m | Hendric

@ asoiaf | song of ice and fire|house of the dragon|game of thrones|fire (&|and) blood|knight of the seven kingdoms|dunk (&|and) egg
  Jon Snow | m | Jon; Aegon Targaryen; Lord Snow
  Daenerys Targaryen | f | Dany; Daenerys; Khaleesi; Dani
  Tyrion Lannister | m | Tyrion; Imp
  Jaime Lannister | m | Jaime; Kingslayer
  Cersei Lannister | f | Cersei
  Sansa Stark | f | Sansa
  Arya Stark | f | Arya
  Robb Stark | m | Robb
  Bran Stark | m | Bran
  Theon Greyjoy | m | Theon; Reek
  Sandor Clegane | m | Sandor; The Hound
  Brienne of Tarth | f | Brienne
  Oberyn Martell | m | Oberyn; Red Viper
  Rhaenyra Targaryen | f | Rhaenyra
  Daemon Targaryen | m | Daemon; Rogue Prince
  Aemond Targaryen | m | Aemond; Aemond One-Eye
  Aegon Targaryen | m | Aegon II
  Jacaerys Velaryon | m | Jace; Jacaerys
  Lucerys Velaryon | m | Luke; Lucerys
  Alicent Hightower | f | Alicent
  Otto Hightower | m | Otto
  Criston Cole | m | Criston
  Laenor Velaryon | m | Laenor
  Corlys Velaryon | m | Corlys; Sea Snake
  Cregan Stark | m | Cregan
  Duncan the Tall | m | Dunk; Duncan; Ser Duncan; Ser Duncan the Tall
  Aegon V Targaryen | m | Egg; Aegon
  Aerion Targaryen | m | Aerion; Brightflame
  Baelor Breakspear | m | Baelor
  Maekar I Targaryen | m | Maekar

@ teen-wolf | teen wolf
  Stiles Stilinski | m | Stiles; Genim
  Derek Hale | m | Derek; Sourwolf
  Scott McCall | m | Scott
  Peter Hale | m | Peter
  Isaac Lahey | m | Isaac
  Jackson Whittemore | m | Jackson
  Lydia Martin | f | Lydia
  Allison Argent | f | Allison
  Chris Argent | m | Chris Argent
  Danny Mahealani | m | Danny
  Theo Raeken | m | Theo
  Liam Dunbar | m | Liam
  Malia Tate | f | Malia
  Kira Yukimura | f | Kira
  Jordan Parrish | m | Parrish; Jordan
  Cora Hale | f | Cora
  Laura Hale | f | Laura
  Erica Reyes | f | Erica
  Vernon Boyd | m | Boyd
  Kate Argent | f | Kate
  Deucalion | m | Duke
  John Stilinski | m | Sheriff Stilinski; Sheriff; Noah

@ stranger-things | stranger things
  Steve Harrington | m | Steve; Stevie; Harrington
  Eddie Munson | m | Eddie; Eds
  Robin Buckley | f | Robin
  Billy Hargrove | m | Billy; Hargrove
  Dustin Henderson | m | Dustin
  Mike Wheeler | m | Mike
  Will Byers | m | Will
  Lucas Sinclair | m | Lucas
  Max Mayfield | f | Max
  Eleven | f | El; Jane; Eleven
  Jonathan Byers | m | Jonathan
  Nancy Wheeler | f | Nancy
  Joyce Byers | f | Joyce
  Jim Hopper | m | Hopper; Hop; Jim
  Murray Bauman | m | Murray
  Erica Sinclair | f | Erica
  Argyle | m | Argyle
  Gareth | m | Gareth; Gare
  Jeff | m | Jeff

@ 9-1-1 | 9-1-1
  Evan Buckley | m | Buck; Evan
  Eddie Diaz | m | Eddie
  Bobby Nash | m | Bobby; Nash; Cap
  Henrietta Wilson | f | Hen; Henrietta
  Howie Han | m | Chimney; Howie; Chim
  Maddie Buckley | f | Maddie
  Christopher Diaz | m | Chris; Christopher
  Athena Grant | f | Athena
  Tommy Kinard | m | Tommy
  Karen Wilson | f | Karen
  Shannon Diaz | f | Shannon
  Isabel Diaz | f | Isabel
  Natalia Dollenmeyer | f | Natalia
  Marisol Suarez | f | Marisol
  Josephina Diaz | f | Pepa; Josephina
  Ravi Panikkar | m | Ravi
  Josh Russo | m | Josh
  Harry Grant | m | Harry
  Michael Grant | m | Michael
  May Grant | f | May

@ rwrb | red,? white (&|and) royal blue
  Alex Claremont-Diaz | m | Alex; Alejandro; Claremont-Diaz
  Henry Fox-Mountchristen-Windsor | m | Henry; Hal; Prince Henry; Fox-Mountchristen-Windsor
  June Claremont-Diaz | f | June
  Nora Holleran | f | Nora
  Pez | m | Pez; Percy Okonkwo
  Zahra Bankston | f | Zahra
  Ellen Claremont | f | President Claremont
  Oscar Diaz | m | Oscar
  Bea | f | Princess Beatrice
  Philip | m | Prince Philip

@ marvel | marvel|avengers|captain america|iron man|thor |spider-?man|deadpool|winter soldier|loki|daredevil|doctor strange|guardians of the galaxy|x-men
  Steve Rogers | m | Steve; Cap; Captain America
  Bucky Barnes | m | Bucky; James Barnes; James Buchanan Barnes; Winter Soldier; Sergeant Barnes
  Tony Stark | m | Tony; Iron Man; Anthony Stark
  Bruce Banner | m | Bruce; Hulk
  Thor Odinson | m | Thor
  Loki Laufeyson | m | Loki; Laufeyson
  Natasha Romanoff | f | Natasha; Nat; Black Widow
  Clint Barton | m | Clint; Hawkeye
  Sam Wilson | m | Falcon
  Peter Parker | m | Spider-Man; Spiderman; Spidey
  Wade Wilson | m | Wade; Deadpool
  Stephen Strange | m | Stephen; Doctor Strange
  Wanda Maximoff | f | Wanda; Scarlet Witch
  James Rhodes | m | Rhodey; War Machine
  Pepper Potts | f | Pepper
  Nick Fury | m | Fury
  Phil Coulson | m | Coulson
  Peggy Carter | f | Peggy
  Matt Murdock | m | Matt; Daredevil
  Scott Lang | m | Scott; Ant-Man
  T'Challa | m | Black Panther
  Erik Killmonger | m | Killmonger; N'Jadaka
  Charles Xavier | m | Charles; Professor X
  Erik Lehnsherr | m | Erik; Magneto
  Logan | m | Wolverine; Logan; James Howlett

@ dc | batman|superman|justice league|dc comics|dcu|teen titans|young justice|green arrow|flash
  Bruce Wayne | m | Bruce; Batman
  Clark Kent | m | Clark; Superman; Kal-El
  Diana Prince | f | Diana; Wonder Woman
  Dick Grayson | m | Dick; Nightwing; Robin; Richard Grayson
  Jason Todd | m | Jason; Red Hood
  Tim Drake | m | Tim; Red Robin
  Damian Wayne | m | Damian
  Barry Allen | m | Barry; Flash
  Hal Jordan | m | Hal; Green Lantern
  Oliver Queen | m | Oliver; Ollie; Green Arrow
  Lex Luthor | m | Lex
  Alfred Pennyworth | m | Alfred
  Selina Kyle | f | Selina; Catwoman
  Harvey Dent | m | Harvey; Two-Face
  Kon-El | m | Conner Kent; Superboy

@ sherlock | sherlock|holmes
  Sherlock Holmes | m | Sherlock
  John Watson | m | John; Watson; Doctor Watson
  Mycroft Holmes | m | Mycroft
  Jim Moriarty | m | Jim; Moriarty
  Greg Lestrade | m | Greg; Lestrade; Detective Inspector
  Molly Hooper | f | Molly
  Mary Morstan | f | Mary
  Irene Adler | f | Irene
  Mrs Hudson | f | Mrs. Hudson

@ witcher | witcher
  Geralt of Rivia | m | Geralt; White Wolf; Butcher of Blaviken
  Jaskier | m | Dandelion; Julian Alfred Pankratz; Julian
  Yennefer of Vengerberg | f | Yennefer; Yen
  Ciri | f | Cirilla; Ciri
  Triss Merigold | f | Triss
  Vesemir | m | Vesemir
  Eskel | m | Eskel
  Lambert | m | Lambert
  Regis | m | Emiel Regis; Regis
  Cahir | m | Cahir
  Fringilla Vigo | f | Fringilla

@ star-trek | star trek
  James T. Kirk | m | Jim; Kirk; Captain Kirk; James Kirk
  Spock | m | Spock; Mr. Spock
  Leonard McCoy | m | Bones; McCoy; Leonard; Doctor McCoy
  Nyota Uhura | f | Uhura; Nyota
  Hikaru Sulu | m | Sulu
  Pavel Chekov | m | Chekov
  Montgomery Scott | m | Scotty; Scott
  Christopher Pike | m | Pike
  Jean-Luc Picard | m | Picard; Jean-Luc
  William Riker | m | Riker; Will Riker
  Data | m | Data

@ star-wars | star wars|mandalorian|clone wars|ahsoka
  Obi-Wan Kenobi | m | Obi-Wan; Ben; Kenobi; Ben Kenobi
  Anakin Skywalker | m | Anakin; Ani; Vader; Darth Vader
  Padme Amidala | f | Padmé; Padme; Amidala
  Ahsoka Tano | f | Ahsoka; Snips
  Rex | m | Captain Rex; CT-7567
  Cody | m | Commander Cody
  Luke Skywalker | m | Luke
  Leia Organa | f | Leia
  Han Solo | m | Han
  Ben Solo | m | Kylo Ren; Kylo; Ben
  Rey | f | Rey
  Poe Dameron | m | Poe
  Finn | m | FN-2187
  Din Djarin | m | Din; Mando; The Mandalorian
  Grogu | m | The Child; Baby Yoda
  Boba Fett | m | Boba
  Palpatine | m | Sheev; Darth Sidious; Sidious
  Mace Windu | m | Mace; Windu
  Qui-Gon Jinn | m | Qui-Gon

@ merlin | merlin
  Merlin | m | Emrys; Merlin
  Arthur Pendragon | m | Arthur; Pendragon
  Morgana | f | Morgana; Morgause
  Guinevere | f | Gwen; Guinevere
  Lancelot | m | Lance; Lancelot
  Gaius | m | Gaius
  Gwaine | m | Gwaine
  Leon | m | Sir Leon
  Percival | m | Percy; Percival
  Elyan | m | Elyan

@ les-mis | les mis|miserables
  Enjolras | m | Enjolras
  Grantaire | m | R; Grantaire
  Combeferre | m | Combeferre
  Courfeyrac | m | Courfeyrac
  Jean Valjean | m | Valjean
  Javert | m | Javert
  Marius Pontmercy | m | Marius
  Eponine Thenardier | f | Eponine; Ponine
  Cosette | f | Cosette
  Jehan Prouvaire | m | Jehan
  Joly | m | Joly
  Bossuet | m | Lesgle; Bossuet
  Bahorel | m | Bahorel
  Feuilly | m | Feuilly

@ good-omens | good omens
  Aziraphale | m | Azi; Zira; Angel; Aziraphale
  Crowley | m | Anthony; Crawly; Anthony J. Crowley; Anthony Crowley

@ naruto | naruto
  Naruto Uzumaki | m | Naruto
  Sasuke Uchiha | m | Sasuke
  Kakashi Hatake | m | Kakashi
  Iruka Umino | m | Iruka
  Itachi Uchiha | m | Itachi
  Sakura Haruno | f | Sakura
  Obito Uchiha | m | Obito
  Minato Namikaze | m | Minato
  Gaara | m | Gaara
  Shikamaru Nara | m | Shikamaru
  Neji Hyuga | m | Neji
  Hinata Hyuga | f | Hinata
  Rock Lee | m | Lee
  Jiraiya | m | Jiraiya
  Tsunade | f | Tsunade

@ haikyuu | haikyuu
  Hinata Shouyou | m | Hinata; Shouyou; Shoyo
  Kageyama Tobio | m | Kageyama; Tobio
  Oikawa Tooru | m | Oikawa; Tooru; Trashykawa
  Iwaizumi Hajime | m | Iwaizumi; Hajime; Iwa-chan
  Sugawara Koushi | m | Suga; Sugawara; Koushi
  Sawamura Daichi | m | Daichi; Sawamura
  Tsukishima Kei | m | Tsukishima; Tsukki; Kei
  Yamaguchi Tadashi | m | Yamaguchi; Tadashi
  Kuroo Tetsurou | m | Kuroo; Tetsurou
  Kozume Kenma | m | Kenma; Kozume
  Bokuto Koutarou | m | Bokuto; Koutarou
  Akaashi Keiji | m | Akaashi; Keiji
  Miya Atsumu | m | Atsumu
  Miya Osamu | m | Osamu
  Sakusa Kiyoomi | m | Sakusa; Kiyoomi
  Ushijima Wakatoshi | m | Ushijima; Ushiwaka
  Tendou Satori | m | Tendou; Satori

@ bts | bts|bangtan
  Jeon Jungkook | m | Jungkook; Kookie; Jk
  Kim Taehyung | m | Taehyung; V; Tae
  Park Jimin | m | Jimin; Chim
  Min Yoongi | m | Yoongi; Suga; Yoon
  Kim Seokjin | m | Jin; Seokjin
  Jung Hoseok | m | Hoseok; J-Hope; Hobi
  Kim Namjoon | m | Namjoon; RM; Joon

@ one-direction | one direction
  Harry Styles | m | Harry; Hazza; Haz; Styles
  Louis Tomlinson | m | Louis; Lou; Tommo; Tomlinson
  Niall Horan | m | Niall; Horan
  Liam Payne | m | Liam; Payne
  Zayn Malik | m | Zayn; Malik

@ hannibal | hannibal
  Will Graham | m | Will; Graham
  Hannibal Lecter | m | Hannibal; Lecter; Doctor Lecter; Dr. Lecter
  Jack Crawford | m | Jack; Crawford
  Alana Bloom | f | Alana
  Bedelia Du Maurier | f | Bedelia
  Freddie Lounds | f | Freddie
  Francis Dolarhyde | m | Dolarhyde; Tooth Fairy

@ buffy | buffy|angel
  Buffy Summers | f | Buffy
  Spike | m | William; William the Bloody; Spike
  Angel | m | Angelus; Liam; Angel
  Willow Rosenberg | f | Willow
  Xander Harris | m | Xander
  Rupert Giles | m | Giles; Rupert
  Faith Lehane | f | Faith
  Dawn Summers | f | Dawn
  Cordelia Chase | f | Cordelia; Cordy

@ percy-jackson | percy jackson|heroes of olympus|trials of apollo
  Percy Jackson | m | Percy; Perseus
  Annabeth Chase | f | Annabeth
  Nico di Angelo | m | Nico
  Will Solace | m | Will
  Jason Grace | m | Jason
  Piper McLean | f | Piper
  Leo Valdez | m | Leo
  Grover Underwood | m | Grover
  Luke Castellan | m | Luke
  Apollo | m | Lester Papadopoulos; Lester

@ hunger-games | hunger games
  Katniss Everdeen | f | Katniss
  Peeta Mellark | m | Peeta
  Gale Hawthorne | m | Gale
  Finnick Odair | m | Finnick
  Haymitch Abernathy | m | Haymitch
  Johanna Mason | f | Johanna
  Effie Trinket | f | Effie
  Coriolanus Snow | m | Coryo; President Snow; Snow
  Lucy Gray Baird | f | Lucy Gray

@ lotr | lord of the rings|hobbit|tolkien|silmarillion
  Frodo Baggins | m | Frodo
  Samwise Gamgee | m | Sam; Samwise
  Aragorn | m | Strider; Elessar; Estel; Aragorn
  Legolas Greenleaf | m | Legolas
  Gimli | m | Gimli
  Boromir | m | Boromir
  Faramir | m | Faramir
  Gandalf | m | Mithrandir; Gandalf; Olorin
  Thorin Oakenshield | m | Thorin
  Bilbo Baggins | m | Bilbo
  Meriadoc Brandybuck | m | Merry; Meriadoc
  Peregrin Took | m | Pippin; Peregrin
  Thranduil | m | Thranduil
  Kili | m | Kili
  Fili | m | Fili
  Elrond | m | Elrond
  Maedhros | m | Maedhros; Nelyafinwe; Russandol
  Fingon | m | Fingon; Findekano
  Celegorm | m | Celegorm; Tyelkormo
  Finrod | m | Finrod; Findarato

@ overwatch | overwatch
  Jack Morrison | m | Soldier: 76; Soldier 76; Jack
  Gabriel Reyes | m | Reaper; Gabe; Gabriel
  Jesse McCree | m | McCree; Jesse; Cole Cassidy
  Hanzo Shimada | m | Hanzo
  Genji Shimada | m | Genji
  Amelie Lacroix | f | Widowmaker; Amelie
  Lena Oxton | f | Tracer; Lena
  Angela Ziegler | f | Mercy; Angela
  Hana Song | f | D.Va; Dva; Hana
  Lucio Correia dos Santos | m | Lucio
  Fareeha Amari | f | Pharah; Fareeha
  Mei-Ling Zhou | f | Mei
  Winston | m | Winston

@ dragon-age | dragon age
  Hawke | m | Hawke
  Fenris | m | Fenris
  Anders | m | Anders
  Varric Tethras | m | Varric
  Dorian Pavus | m | Dorian
  Cullen Rutherford | m | Cullen
  Solas | m | Solas
  Cassandra Pentaghast | f | Cassandra
  Iron Bull | m | Bull; Hissrad
  Cole | m | Cole
  Josephine Montilyet | f | Josephine
  Leliana | f | Leliana
  Alistair | m | Alistair
  Zevran Arainai | m | Zevran
  Morrigan | f | Morrigan
  Sebastian Vael | m | Sebastian
  Isabela | f | Isabela
  Merrill | f | Merrill
  Inquisitor Lavellan | m | Lavellan; Inquisitor

@ avatar | avatar: the last airbender|last airbender|legend of korra
  Zuko | m | Zuko; Prince Zuko
  Sokka | m | Sokka
  Aang | m | Aang
  Katara | f | Katara
  Toph Beifong | f | Toph
  Iroh | m | Iroh; Uncle Iroh
  Azula | f | Azula
  Suki | f | Suki
  Mai | f | Mai
  Ty Lee | f | Ty Lee
  Korra | f | Korra
  Asami Sato | f | Asami

@ voltron | voltron
  Keith Kogane | m | Keith
  Lance McClain | m | Lance
  Takashi Shirogane | m | Shiro; Takashi
  Katie Holt | f | Pidge; Katie
  Hunk Garrett | m | Hunk
  Allura | f | Allura
  Coran | m | Coran
  Matt Holt | m | Matt
  Lotor | m | Lotor

@ hamilton | hamilton
  Alexander Hamilton | m | Alex; Hamilton; Alexander
  Aaron Burr | m | Burr; Aaron
  Marquis de Lafayette | m | Lafayette; Laf; Gilbert; Gilbert du Motier
  Hercules Mulligan | m | Herc; Hercules; Mulligan
  John Laurens | m | Laurens; Jack
  Thomas Jefferson | m | Jefferson
  James Madison | m | Madison; Jemmy
  George Washington | m | Washington; General Washington
  Eliza Schuyler | f | Eliza; Elizabeth
  Angelica Schuyler | f | Angelica
  Peggy Schuyler | f | Peggy

@ doctor-who | doctor who
  The Doctor | m | Doctor; Ten; Eleven; Twelve; Thirteen; Nine; Eight
  Rose Tyler | f | Rose
  Martha Jones | f | Martha
  Donna Noble | f | Donna
  Jack Harkness | m | Captain Jack; Jack
  The Master | m | Missy; Master
  River Song | f | River; Melody Pond
  Clara Oswald | f | Clara
  Amy Pond | f | Amy
  Rory Williams | m | Rory

@ our-flag-means-death | our flag means death
  Stede Bonnet | m | Stede; Bonnet; Gentleman Pirate
  Edward Teach | m | Ed; Edward; Blackbeard; Teach; Edward Teach
  Izzy Hands | m | Izzy; Hands; Israel Hands
  Lucius Spriggs | m | Lucius
  Jim Jimenez | f | Jim
  Oluwande Boyce | m | Wee John; Oluwande
  Roach | m | Roach
  Frenchie | m | Frenchie
  Buttons | m | Buttons
  Black Pete | m | Pete; Black Pete
  Fang | m | Fang
  Ivan | m | Ivan

@ last-of-us | last of us
  Joel Miller | m | Joel
  Ellie Williams | f | Ellie
  Tommy Miller | m | Tommy
  Tess Servopoulos | f | Tess
  Bill | m | Bill
  Frank | m | Frank
  Dina | f | Dina
  Abby Anderson | f | Abby
  Marlene | f | Marlene
  Sarah Miller | f | Sarah

@ shadowhunters | shadowhunters|mortal instruments|infernal devices
  Alec Lightwood | m | Alec; Alexander
  Magnus Bane | m | Magnus
  Jace Wayland | m | Jace; Jace Herondale; Jonathan Christopher Morgenstern
  Clary Fray | f | Clary
  Simon Lewis | m | Simon
  Isabelle Lightwood | f | Izzy; Isabelle
  Max Lightwood | m | Max
  Raphael Santiago | m | Raphael
  Lorenzo Rey | m | Lorenzo
  Luke Garroway | m | Luke
  Tessa Gray | f | Tessa
  Will Herondale | m | Will
  Jem Carstairs | m | Jem
  Jonathan Morgenstern | m | Sebastian

@ kingsman | kingsman
  Gary Unwin | m | Eggsy; Gary; Galahad
  Harry Hart | m | Harry; Galahad; Hart
  Merlin | m | Hamish; Merlin
  Roxy Morton | f | Roxy; Lancelot
  Percival | m | Percival
  Gazelle | f | Gazelle

@ top-gun | top gun
  Pete Mitchell | m | Maverick; Pete; Mitchell
  Tom Kazansky | m | Iceman; Ice; Kazansky
  Nick Bradshaw | m | Goose; Nick
  Bradley Bradshaw | m | Rooster; Bradley
  Jake Seresin | m | Hangman; Jake
  Natasha Trace | f | Phoenix; Natasha
  Javy Machado | m | Fanboy; Javy
  Mickey Garcia | f | Payback

@ mha | my hero academia|boku no hero
  Midoriya Izuku | m | Deku; Midoriya; Izuku
  Bakugou Katsuki | m | Bakugou; Katsuki; Kacchan; Bakugo
  Todoroki Shouto | m | Todoroki; Shouto
  Kirishima Eijirou | m | Kirishima; Eijirou
  Iida Tenya | m | Iida; Tenya
  Uraraka Ochako | f | Uraraka; Ochako
  Kaminari Denki | m | Kaminari; Denki
  Aizawa Shouta | m | Aizawa; Eraserhead; Shouta
  Yagi Toshinori | m | All Might; Toshinori; Yagi
  Dabi | m | Dabi; Touya
  Hawks | m | Hawks; Keigo; Takami Keigo
  Shigaraki Tomura | m | Shigaraki; Tomura

@ fma | fullmetal alchemist
  Edward Elric | m | Edward; Ed; Fullmetal
  Alphonse Elric | m | Alphonse; Al
  Roy Mustang | m | Roy; Mustang; Colonel Mustang
  Riza Hawkeye | f | Riza; Hawkeye
  Winry Rockbell | f | Winry
  Maes Hughes | m | Hughes; Maes
  Scar | m | Scar
  Envy | m | Envy

@ jjk | jujutsu kaisen
  Itadori Yuuji | m | Itadori; Yuuji; Yuji
  Fushiguro Megumi | m | Fushiguro; Megumi
  Gojo Satoru | m | Gojo; Satoru
  Geto Suguru | m | Geto; Suguru
  Kugisaki Nobara | f | Kugisaki; Nobara
  Nanami Kento | m | Nanami; Kento
  Sukuna | m | Sukuna; Ryomen Sukuna

@ one-piece | one piece
  Monkey D. Luffy | m | Luffy
  Roronoa Zoro | m | Zoro
  Sanji | m | Sanji
  Nami | f | Nami
  Usopp | m | Usopp
  Trafalgar Law | m | Law; Torao
  Portgas D. Ace | m | Ace
  Shanks | m | Shanks
  Nico Robin | f | Robin

@ the-magnus-archives | magnus archives
  Jonathan Sims | m | Jon; Archivist; Jonathan
  Martin Blackwood | m | Martin
  Tim Stoker | m | Tim
  Sasha James | f | Sasha
  Elias Bouchard | m | Elias
  Georgie Barker | f | Georgie
  Melanie King | f | Melanie
  Basira Hussain | f | Basira
  Daisy Tonner | f | Daisy

@ check-please | check,? please|ngozi
  Eric Bittle | m | Bitty; Eric; Bittle
  Jack Zimmermann | m | Jack; Zimmermann; Zimms
  Shitty Knight | m | Shitty
  Lardo | f | Lardo
  Ransom | m | Ransom
  Holster | m | Holster
  Chowder | m | Chowder
  Nursey | m | Nursey; Derek Nurse
  Dex | m | Dex; Will Poindexter

@ young-royals | young royals
  Wilhelm | m | Wille; Prince Wilhelm; Wilhelm
  Simon Eriksson | m | Simon
  August | m | August
  Felice | f | Felice
  Sara | f | Sara

@ heartstopper | heartstopper
  Nick Nelson | m | Nick
  Charlie Spring | m | Charlie
  Tao Xu | m | Tao
  Elle Argent | f | Elle
  Tara Jones | f | Tara
  Darcy Olsson | f | Darcy
  Isaac Henderson | m | Isaac
  Ben Hope | m | Ben

`;
