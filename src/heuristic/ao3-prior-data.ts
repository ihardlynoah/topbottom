// Tag counts from a community tally of AO3 "top" and "bottom" character tags (the "Top Tops", "Top Bottoms" and "Most
// Versatile" sheets). Each line: "Name; alias; alias | top bottom". Used only as a very faint prior; the text always wins.
// Fandom sections: "@ id | regex matched against the work's fandom tags".

export const AO3_PRIOR_RAW = `
@ bts | bangtan|bts
  Jeon Jungkook; Jungkook; Kook | 13988 9663
  Kim Taehyung; V; Taehyung | 7959 7943
  Min Yoongi; Suga; Yoongi | 6062 5358
  Kim Namjoon; RM; Namjoon | 3995 2249
  Park Jimin; Jimin | 4859 10424
  Kim Seokjin; Jin; Seokjin | 2565 3038
  Jung Hoseok; J-Hope; Hoseok | 2527 2564

@ stray-kids | stray kids
  Lee Minho; Lee Know; Minho | 4888 2834
  Bang Chan; Chan; Christopher Bang | 3803 1836
  Hwang Hyunjin; Hyunjin | 2285 2108
  Seo Changbin; Changbin | 1305 942
  Yang Jeongin; I.N; Jeongin | 1135 694
  Han Jisung; Han; Jisung | 1962 4252
  Lee Felix; Felix | 922 3260
  Kim Seungmin; Seungmin | 828 1405

@ supernatural | supernatural
  Castiel; Cas | 7744 6113
  Dean Winchester; Dean | 8461 12865
  Sam Winchester; Sam | 4065 4661
  Jared Padalecki; Jared | 1068 694
  Jensen Ackles; Jensen | 1299 1587

@ jjk | jujutsu kaisen
  Gojo Satoru; Gojo; Satoru | 5741 4950
  Getou Suguru; Geto Suguru; Geto; Getou | 3721 2543
  Ryomen Sukuna; Sukuna | 2644 584
  Fushiguro Toji; Toji | 1055 325
  Nanami Kento; Nanami | 908 571
  Fushiguro Megumi; Megumi | 946 3367
  Itadori Yuuji; Itadori Yuji; Yuuji; Itadori | 1205 3114

@ genshin | genshin impact
  Zhongli | 4473 2687
  Alhaitham | 3610 1671
  Diluc; Diluc Ragnvindr | 2094 1975
  Wriothesley | 1690 462
  Kaedehara Kazuha; Kazuha | 873 702
  Kamisato Ayato; Ayato | 712 524
  Tartaglia; Childe; Ajax | 4030 4561
  Kaveh | 1463 3321
  Kaeya; Kaeya Alberich | 1948 2265
  Scaramouche; Wanderer; Kunikuzushi | 997 1909
  Aether; Kong | 803 1649
  Neuvillette | 1126 1435
  Xiao; Alatus | 1003 1032

@ mcu | marvel|avengers|captain america|iron man|thor|winter soldier|loki
  Steve Rogers; Steve; Captain America | 4228 3975
  Thor; Thor Odinson | 808 573
  Bucky Barnes; Bucky; James Barnes; Winter Soldier | 3649 4069
  Tony Stark; Tony; Iron Man | 1748 2689
  Loki; Loki Laufeyson | 855 1524
  Peter Parker; Peter | 848 2034

@ hsr | honkai
  Phainon | 4171 2096
  Blade | 1252 1126
  Jing Yuan | 1011 762
  Mydei | 1441 3370
  Aventurine | 1200 1834
  Dan Heng | 997 1221

@ bnha | my hero academia|boku no hero
  Kirishima Eijirou; Eijirou Kirishima; Kirishima | 3254 1469
  Dabi; Todoroki Touya | 1785 1189
  Shinsou Hitoshi; Shinsou | 817 390
  Aizawa Shouta; Eraserhead; Aizawa | 778 571
  Bakugou Katsuki; Bakugo Katsuki; Katsuki Bakugou; Bakugou; Katsuki; Kacchan | 7366 9668
  Midoriya Izuku; Izuku Midoriya; Izuku; Deku | 5089 6263
  Todoroki Shouto; Shouto Todoroki; Shouto; Todoroki | 1731 2222
  Takami Keigo; Keigo; Hawks | 885 1208

@ mdzs | mo dao zu shi|untamed|módào zǔshī|grandmaster of demonic
  Lan Zhan; Lan Wangji; Wangji | 3161 1913
  Lan Huan; Lan Xichen; Xichen | 767 361
  Wei Ying; Wei Wuxian; Wuxian | 1620 3209
  Jiang Cheng; Jiang Wanyin | 393 1140

@ good-omens | good omens
  Crowley; Anthony J. Crowley | 2966 2414
  Aziraphale | 2520 2509

@ hannibal | hannibal
  Hannibal Lecter; Hannibal | 2897 1675
  Will Graham; Will | 1096 2771

@ arcane | arcane|league of legends
  Jayce; Jayce Talis | 2801 1803
  Vi | 1439 834
  Viktor | 1620 2736
  Caitlyn; Caitlyn Kiramman | 966 1170

@ bsd | bungou stray dogs
  Nakahara Chuuya; Chuuya | 2682 2547
  Dazai Osamu; Dazai | 2842 3730
  Fyodor Dostoyevsky; Fyodor | 587 530
  Akutagawa Ryuunosuke; Akutagawa | 564 660

@ stranger-things | stranger things
  Eddie Munson; Eddie | 2680 1392
  Mike Wheeler; Mike | 954 435
  Billy Hargrove; Billy | 764 724
  Steve Harrington; Steve | 1769 3490
  Will Byers; Will | 340 1106
  Robin Buckley; Robin | 490 540

@ cod | call of duty
  Simon Riley; Ghost; Simon "Ghost" Riley | 2563 1646
  John MacTavish; Soap; Johnny MacTavish | 1388 2262

@ dsmp | dream smp|video blogging
  Clay; Dream | 2364 1548
  Sapnap | 805 689
  Wilbur Soot; Wilbur | 606 565
  GeorgeNotFound; George | 869 1958

@ dmc | devil may cry
  Vergil | 2231 1660
  Dante | 1565 2446

@ txt | tomorrow x together|txt
  Choi Soobin; Soobin | 2175 1396
  Choi Yeonjun; Yeonjun | 1788 1571
  Huening Kai; Kai | 607 701
  Choi Beomgyu; Beomgyu | 938 1437
  Kang Taehyun; Taehyun | 664 900

@ seventeen | seventeen
  Kim Mingyu; Mingyu | 2011 681
  Choi Seungcheol; S.Coups; Seungcheol | 1168 458
  Yoon Jeonghan; Jeonghan | 1217 1352
  Hong Jisoo; Joshua; Jisoo | 672 1348
  Jeon Wonwoo; Wonwoo | 1034 1285

@ heated-rivalry | heated rivalry
  Ilya Rozanov; Ilya | 2001 165
  Shane Hollander; Shane | 133 2101

@ ateez | ateez
  Kim Hongjoong; Hongjoong | 1970 1429
  Choi San; San | 1694 962
  Jeong Yunho; Yunho | 1529 649
  Park Seonghwa; Seonghwa | 1352 1816
  Jung Wooyoung; Wooyoung | 717 1741
  Song Mingi; Mingi | 920 1071
  Kang Yeosang; Yeosang | 369 904

@ superman | superman|dc comics|justice league
  Clark Kent; Clark; Kal-El | 1961 1211

@ enhypen | enhypen
  Park Sunghoon; Sunghoon | 1942 727
  Lee Heeseung; Heeseung | 1789 617
  Park Jongseong; Jay | 1205 786
  Nishimura Riki; Riki; Ni-ki | 723 605
  Kim Sunoo; Sunoo | 363 1978
  Yang Jungwon; Jungwon | 605 910

@ one-direction | one direction
  Harry Styles; Harry | 1863 1809
  Zayn Malik; Zayn | 703 637
  Louis Tomlinson; Louis | 3863 5779

@ one-piece | one piece
  Roronoa Zoro; Zoro | 1801 1734
  Sanji; Vinsmoke Sanji | 1134 1882
  Monkey D. Luffy; Luffy | 1062 1437
  Trafalgar D. Water Law; Trafalgar Law; Law | 861 1105

@ hazbin | hazbin hotel|helluva boss
  Lucifer Magne; Lucifer Morningstar; Lucifer | 1753 1493
  Vox | 1513 1075
  Blitzo | 719 433
  Valentino | 500 474
  Alastor | 2173 2744

@ f1 | formula 1|formula one
  Max Verstappen; Max | 1726 1112
  Oscar Piastri; Oscar | 897 620
  Charles Leclerc; Charles | 678 1233

@ orv | omniscient reader
  Yoo Joonghyuk; Joonghyuk | 1572 833
  Kim Dokja; Dokja | 809 1733

@ sherlock | sherlock
  John Watson; John | 1555 1273
  Sherlock Holmes; Sherlock | 1342 1596

@ naruto | naruto
  Uzumaki Naruto; Naruto | 1549 1368
  Uchiha Obito; Obito | 703 258
  Uchiha Sasuke; Sasuke | 1192 1638
  Hatake Kakashi; Kakashi | 864 1106

@ harry-potter | harry potter
  Remus Lupin; Remus | 1520 460
  James Potter; James | 881 318
  Tom Riddle; Tom Marvolo Riddle; Voldemort | 803 398
  Harry Potter; Harry | 4039 4051
  Draco Malfoy; Draco | 3153 4924
  Severus Snape; Severus; Snape | 964 1964
  Sirius Black; Sirius | 775 1423

@ aot | shingeki|attack on titan
  Erwin Smith; Erwin | 1351 692
  Levi Ackerman; Levi | 3102 3156
  Eren Yeager; Eren Jaeger; Eren | 2193 2814

@ tgcf | tian guan ci fu|heaven official
  Hua Cheng; San Lang | 1307 705
  Xie Lian | 602 1322

@ blue-lock | blue lock
  Itoshi Rin; Rin | 1268 852
  Nagi Seishirou; Nagi | 1046 273
  Michael Kaiser; Kaiser | 949 567
  Isagi Yoichi; Isagi | 911 1425
  Itoshi Sae; Sae | 491 1025
  Mikage Reo; Reo | 273 934

@ ofmd | our flag means death
  Stede Bonnet; Stede | 1258 1172
  Blackbeard; Edward Teach; Ed | 993 1354

@ nct | nct
  Mark Lee; Mark | 1226 788
  Lee Jeno; Jeno | 1149 765
  Na Jaemin; Jaemin | 992 896
  Suh Youngho; Johnny | 781 302
  Jung Jaehyun; Jaehyun; Jeong Yuno | 729 446
  Lee Donghyuck; Haechan; Donghyuck | 570 1327

@ deadpool | deadpool|wolverine
  Wade Wilson; Wade; Deadpool | 1221 1037
  Logan; Wolverine | 539 473

@ alien-stage | alien stage
  Ivan | 1123 748
  Till | 651 1176

@ haikyuu | haikyuu
  Sakusa Kiyoomi; Sakusa | 1066 1017
  Kuroo Tetsurou; Kuroo | 978 472
  Bokuto Koutarou; Bokuto | 825 466
  Miya Osamu; Osamu | 697 352
  Miya Atsumu; Atsumu | 1147 1549
  Hinata Shouyou; Hinata | 698 1030
  Kageyama Tobio; Kageyama | 716 910

@ zb1 | zerobaseone|zb1
  Sung Hanbin; Hanbin | 1057 501

@ bg3 | baldur
  Astarion | 998 910
  Gale; Gale Dekarios | 501 516

@ shameless | shameless
  Ian Gallagher; Ian | 892 347
  Mickey Milkovich; Mickey | 220 941

@ squid-game | squid game
  Hwang Inho; Inho | 851 284
  Seong Gihun; Gihun | 306 945

@ shadowhunters | shadowhunters|mortal instruments
  Magnus Bane; Magnus | 747 576
  Alec Lightwood; Alec | 628 720

@ rwrb | red,? white (&|and) royal blue
  Alex Claremont-Diaz; Alex | 759 379

@ star-wars | star wars
  Kylo Ren; Ben Solo; Kylo | 716 584
  Anakin Skywalker; Anakin | 1374 1449
  Obi-Wan Kenobi; Obi-Wan | 1395 2174

@ sonic | sonic the hedgehog
  Sonic; Sonic the Hedgehog | 715 694

@ jojo | jojo
  Kujo Jotaro; Jotaro | 592 579

@ south-park | south park
  Kyle Broflovski; Kyle | 519 550

@ death-note | death note
  Yagami Light; Light | 456 504
  L; L Lawliet | 405 498

@ persona | persona
  Akechi Goro; Akechi | 880 946

@ yoi | yuri!!! on ice|yuri on ice
  Victor Nikiforov; Victor | 529 596
  Katsuki Yuuri; Yuuri | 503 574

@ project-sekai | project sekai
  Kamishiro Rui; Rui | 506 429

@ exo | exo
  Kim Jongin; Kai; Jongin | 713 716

@ witcher | witcher|wiedźmin
  Geralt of Rivia; Geralt z Rivii; Geralt | 1000 1004
  Jaskier; Dandelion | 640 1187

@ hetalia | hetalia
  America; Alfred F. Jones; Alfred | 649 550

@ voltron | voltron
  Keith | 1504 2193
  Lance | 1189 1304
  Shiro | 731 1025

@ teen-wolf | teen wolf
  Stiles Stilinski; Stiles | 1962 3409
  Derek Hale; Derek | 2500 2783

@ 9-1-1 | 9-1-1
  Evan Buckley; Buck | 1482 1790
  Eddie Diaz; Eddie | 1404 1492

@ batman | batman|dc comics|dcu
  Bruce Wayne; Bruce | 1515 2513
  Jason Todd; Jason | 1109 2328
  Dick Grayson; Dick; Nightwing | 1007 1600

@ re | resident evil|biohazard
  Leon S. Kennedy; Leon Kennedy; Leon | 331 991

@ mcr | my chemical romance
  Gerard Way; Gerard | 836 972
  Frank Iero; Frank | 805 923
`;
