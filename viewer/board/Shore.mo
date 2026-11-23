package Shore "Beach and convex shoreline boulders in east, north, up coordinates"
  // BEGIN BAKED
  constant Real rocks[46,13]=[36.918666,50.4818769,0.0546509,1.2236195,0.5208195,0.5762196,0.254188,-0.7568849,0.2067527,1.0821336,0.5268973,-0.6976057,0.5018164;
27.8436435,49.823778,-0.5012133,1.6249961,-0.5190957,-0.1877656,0.3979261,-0.0685292,-0.9039069,-0.5159145,0.3958481,-0.2558404,0.395664;
34.5420633,49.6693666,0.4107186,2.2877204,-0.027747,-0.3746065,-0.2235415,1.2269728,-0.0613484,-0.0494912,0.0108264,-0.6184078,1.0349721;
20.0558215,33.9929061,-1.8448415,2.4729191,-0.3330699,-0.2292318,-0.006384,0.7378627,-1.0608763,-0.4030837,0.1013198,-0.1644335,0.6182431;
35.3955964,28.4061145,-0.8884273,1.7044239,0.4544721,-0.2210384,-0.2980335,0.435414,0.3624953,0.3951172,0.0392747,-0.5869243,0.4951862;
44.8153943,48.1455885,0.3631527,1.2884819,-0.5892087,-0.4972763,0.2139736,0.5152321,-0.8909334,-0.6517665,0.4098478,-0.2179884,0.6219711;
25.7510886,49.8555845,-1.5843445,2.2317575,0.2930787,0.3012493,0.1553288,-1.0512744,0.7126294,0.6014791,0.0735208,-0.3541071,0.5480451;
19.0043013,41.7535266,-0.1699365,2.0972856,-0.388853,-0.2705869,0.0540444,0.1652218,-0.3480165,-0.5536513,0.5642385,-0.6905269,0.6024355;
50.7654069,32.9896572,-1.5177338,1.6985937,-0.0133729,-0.3905861,-0.5846287,0.4566101,0.3040939,-0.2136074,0.5960422,-0.6156425,0.3976723;
21.7035128,38.4848534,0.2715831,1.5579245,-0.5879376,0.6260892,0.1459832,-0.4722286,-0.4319388,-0.0493805,0.0795814,-0.2425885,1.3609168;
40.3509622,29.8513582,0.1853108,2.4658387,-0.2518437,-0.2423919,0.2056327,0.4742032,-1.1174683,-0.7364597,0.6894688,-0.1485339,0.6693242;
43.2827726,49.0812022,-0.332069,2.3952917,0.2437207,0.3190854,0.1143635,-0.9346165,0.5506275,0.4554612,0.2355244,-0.6231078,1.2366042;
50.1568521,35.3264707,0.0533077,1.3711723,0.5248041,-0.5766928,-0.5540412,0.6516324,0.4378387,0.1615059,0.1421583,-0.4240643,0.5760584;
34.0417376,49.6929155,0.3848601,2.4436158,0.1179411,-0.3381239,-0.1980683,0.4349272,0.4353274,-0.4841704,0.5844922,-0.0679165,0.4639805;
40.5360522,50.083698,-0.5007024,1.0948826,0.0296224,-0.9482125,-0.2834352,0.8241757,0.13614,-0.3693104,0.4908957,-0.2811499,0.9918717;
25.0399331,31.9266908,-0.0050256,2.380507,-0.3038236,0.2306784,0.1759112,-0.4151301,-0.4565939,-0.1182415,0.2340974,-0.480826,1.034843;
41.4379718,28.630244,-1.3539241,1.3788315,-0.4386736,-0.5730052,0.0722543,0.6691917,-0.5858081,-0.5828628,0.7124869,-0.3925566,1.2125548;
50.7360865,42.2421889,-0.0079678,1.6031041,-0.6034298,-0.5391253,0.2772514,0.3361664,-0.4828522,-0.207267,0.3731217,-0.0484126,0.7179489;
43.69994,48.617189,0.0762137,2.3674492,-0.193259,0.0949868,0.363382,-0.2282042,-0.608193,0.0376128,0.6523941,-0.2197787,0.4044149;
49.3495121,45.7865726,-0.4204787,2.2677477,0.0004666,-0.3091218,-0.3144752,0.6992463,0.0769793,-0.0746314,0.1796481,-0.8354278,0.8214726;
52.112687,45.0422956,-1.1694076,1.6489776,0.1221368,-0.3859484,-0.5825854,0.4234008,0.3975156,-0.1745799,0.84662,-0.6381375,0.6002408;
37.5472301,49.6915582,0.3618303,1.0922633,-0.6798155,-0.6187269,0.2610093,0.4548235,-0.8577503,-0.8486946,0.5564931,-0.3404699,0.6423327;
18.7111769,41.872861,-0.3756789,1.548157,-0.1806005,0.6784934,0.2152734,-0.5845549,-0.2113321,0.1756673,0.2460938,-0.1406382,0.6497169;
18.9917755,37.7744057,-0.6850642,1.9391098,-0.0527646,-0.324314,-0.3974713,0.6352817,0.2042756,-0.2510113,0.2926214,-0.4782551,0.3513832;
21.3572138,41.861612,0.7011609,1.6736308,0.5861556,-0.2944612,-0.3845826,0.2657459,0.535133,-0.0046999,0.6853491,-0.3289567,1.2964347;
51.06975,40.7378461,0.2255527,1.8710553,-0.2847656,0.1097646,0.4387544,-0.4868533,-0.4557402,-0.2019693,0.3267848,-0.4983372,0.3367644;
25.351271,47.2594587,0.4238689,1.0530178,-0.4296817,0.4031742,0.7447566,-0.7660157,-0.835457,0.0103279,0.8220994,-0.7429332,0.8764911;
41.4133074,29.4847979,-0.5343888,1.364507,-0.1645499,-0.6260902,-0.4110763,0.3758661,0.2732862,-0.5666843,0.6247394,-0.3313458,0.2545794;
21.6526853,35.3110191,-0.3790909,1.2638458,-0.0419809,0.4831809,0.6251623,-0.5646592,-0.5054013,0.352701,0.7115764,-0.4947877,0.4301996;
52.0209241,43.8422425,-0.8613018,2.455692,-0.3011602,0.1158087,0.2484284,-0.3958895,-0.7978693,-0.1079827,0.6902455,-0.4864227,1.0635114;
33.7702347,49.4990903,0.5183909,1.4582479,-0.6008288,0.7170694,0.3296969,-0.4884076,-0.4655352,0.1224508,0.2496114,-0.0904701,0.6516503;
39.6706529,28.6067629,-0.5951806,1.3753015,0.144894,0.6517327,0.3104206,-0.952016,-0.2546479,0.9790066,0.5097996,-0.3109404,0.4148665;
41.0039234,49.8114207,-0.4835857,2.2218023,-0.0659233,-0.4067053,-0.1811669,0.4764476,0.0941082,-0.384636,0.42313,-0.272374,0.4574888;
39.6364633,49.0788765,0.2570254,2.1301195,-0.0840315,-0.4618753,0.0000292,0.3385993,-0.0616334,-0.4780147,0.6463352,-0.1175613,0.4729862;
29.3306078,31.2416265,0.1055301,2.071383,0.4489328,0.0444544,-0.1718991,-0.0387375,1.2234549,0.2152278,0.5031566,-0.2058677,1.2608078;
38.5353216,50.7651303,-0.2295911,2.1205052,-0.0623655,-0.436099,-0.1682893,0.7513939,0.2334853,-0.8835008,0.4737617,-0.2025784,0.3493857;
35.4533116,51.4300708,-0.6989334,1.850374,0.333117,-0.2409942,-0.3507432,0.5630177,1.0484183,-0.1856399,0.6288948,-0.2068062,0.7393861;
41.7952199,49.4069902,-0.3929023,1.6611737,-0.2918007,0.3534336,0.3902842,-0.5369127,-0.4956943,0.0474617,0.4424054,-0.4118147,0.703701;
41.4073567,50.448864,-1.0540176,2.1604899,0.1627126,0.4131196,0.1307452,-0.7105729,0.1597641,0.3794975,0.2394672,-0.2725327,0.5631126;
45.8465724,50.1007682,-1.4310351,1.5037627,-0.168489,0.5111806,0.3905495,-0.5231856,-0.6185444,0.5838873,0.6342626,-0.124436,0.4365018;
39.87607,49.5356549,-0.0088908,1.4563535,0.4495541,0.0754445,-0.5135101,0.472865,0.9562618,0.5544644,0.5669384,-0.5235322,0.4194111;
51.2688444,34.3805958,-0.8433895,1.8367764,-0.2474042,0.2100379,0.4371287,-0.8268324,-0.9533896,-0.0098687,0.723196,-0.6345888,0.7142277;
53.078111,37.4264451,-0.6729783,1.4861235,0.5345422,-0.1041868,-0.3952123,0.4623757,0.6496417,0.4541237,0.4546135,-0.9235957,0.8583654;
54.1941428,41.5551234,-1.2396473,1.5788384,-0.8740075,-0.3775757,-0.0698205,0.22441,-0.3962578,-0.666262,0.1840724,-0.4916214,0.3543899;
20.8170193,43.1219307,0.22693,1.5296388,-0.611669,-0.3869868,-0.2031843,0.4432028,-0.3409897,-0.6847718,0.1925051,-0.5005619,0.3738549;
38.4762303,49.904335,0.1554927,1.6085777,0.6639178,0.1472898,-0.3198267,-0.0385673,0.5901122,0.1917037,0.4084341,-0.2163699,0.7482103];
  constant Real planes[80,4]=[-0.5831288,0.7487835,0.3150938,0.9435222;
-0.5773503,0.5773503,0.5773503,0.9341724;
-0.7487835,0.3150938,0.5831288,0.9435222;
-0.3150938,0.5831288,0.7487835,0.9435222;
-0.2680349,0.9435222,0.1947387,0.9435222;
0,0.9341724,0.3568221,0.9341724;
0,0.7778675,0.6284284,0.9435222;
0.2680349,0.9435222,0.1947387,0.9435222;
-0.2680349,0.9435222,-0.1947387,0.9435222;
0,0.9341724,-0.3568221,0.9341724;
0.2680349,0.9435222,-0.1947387,0.9435222;
0,0.7778675,-0.6284284,0.9435222;
-0.5831288,0.7487835,-0.3150938,0.9435222;
-0.5773503,0.5773503,-0.5773503,0.9341724;
-0.3150938,0.5831288,-0.7487835,0.9435222;
-0.7487835,0.3150938,-0.5831288,0.9435222;
-0.7778675,0.6284284,0,0.9435222;
-0.9341724,0.3568221,0,0.9341724;
-0.9435222,0.1947387,-0.2680349,0.9435222;
-0.9435222,0.1947387,0.2680349,0.9435222;
0.5831288,0.7487835,0.3150938,0.9435222;
0.5773503,0.5773503,0.5773503,0.9341724;
0.3150938,0.5831288,0.7487835,0.9435222;
0.7487835,0.3150938,0.5831288,0.9435222;
-0.1947387,0.2680349,0.9435222,0.9435222;
-0.3568221,0,0.9341724,0.9341724;
-0.6284284,0,0.7778675,0.9435222;
-0.1947387,-0.2680349,0.9435222,0.9435222;
-0.9435222,-0.1947387,0.2680349,0.9435222;
-0.9341724,-0.3568221,0,0.9341724;
-0.9435222,-0.1947387,-0.2680349,0.9435222;
-0.7778675,-0.6284284,0,0.9435222;
-0.6284284,0,-0.7778675,0.9435222;
-0.3568221,0,-0.9341724,0.9341724;
-0.1947387,0.2680349,-0.9435222,0.9435222;
-0.1947387,-0.2680349,-0.9435222,0.9435222;
0.3150938,0.5831288,-0.7487835,0.9435222;
0.5773503,0.5773503,-0.5773503,0.9341724;
0.5831288,0.7487835,-0.3150938,0.9435222;
0.7487835,0.3150938,-0.5831288,0.9435222;
0.5831288,-0.7487835,0.3150938,0.9435222;
0.5773503,-0.5773503,0.5773503,0.9341724;
0.7487835,-0.3150938,0.5831288,0.9435222;
0.3150938,-0.5831288,0.7487835,0.9435222;
0.2680349,-0.9435222,0.1947387,0.9435222;
0,-0.9341724,0.3568221,0.9341724;
0,-0.7778675,0.6284284,0.9435222;
-0.2680349,-0.9435222,0.1947387,0.9435222;
0.2680349,-0.9435222,-0.1947387,0.9435222;
0,-0.9341724,-0.3568221,0.9341724;
-0.2680349,-0.9435222,-0.1947387,0.9435222;
0,-0.7778675,-0.6284284,0.9435222;
0.5831288,-0.7487835,-0.3150938,0.9435222;
0.5773503,-0.5773503,-0.5773503,0.9341724;
0.3150938,-0.5831288,-0.7487835,0.9435222;
0.7487835,-0.3150938,-0.5831288,0.9435222;
0.7778675,-0.6284284,0,0.9435222;
0.9341724,-0.3568221,0,0.9341724;
0.9435222,-0.1947387,-0.2680349,0.9435222;
0.9435222,-0.1947387,0.2680349,0.9435222;
0.1947387,-0.2680349,0.9435222,0.9435222;
0.3568221,0,0.9341724,0.9341724;
0.6284284,0,0.7778675,0.9435222;
0.1947387,0.2680349,0.9435222,0.9435222;
-0.5831288,-0.7487835,0.3150938,0.9435222;
-0.5773503,-0.5773503,0.5773503,0.9341724;
-0.3150938,-0.5831288,0.7487835,0.9435222;
-0.7487835,-0.3150938,0.5831288,0.9435222;
-0.3150938,-0.5831288,-0.7487835,0.9435222;
-0.5773503,-0.5773503,-0.5773503,0.9341724;
-0.5831288,-0.7487835,-0.3150938,0.9435222;
-0.7487835,-0.3150938,-0.5831288,0.9435222;
0.6284284,0,-0.7778675,0.9435222;
0.3568221,0,-0.9341724,0.9341724;
0.1947387,-0.2680349,-0.9435222,0.9435222;
0.1947387,0.2680349,-0.9435222,0.9435222;
0.9435222,0.1947387,0.2680349,0.9435222;
0.9341724,0.3568221,0,0.9341724;
0.9435222,0.1947387,-0.2680349,0.9435222;
0.7778675,0.6284284,0,0.9435222];
  // END BAKED
  // x, half beam, sheer and keel height along one catamaran pontoon [m].
  // Lowest keel is -0.370 m. Including the crowned deck, the floor-to-bow
  // and floor-to-stern heights are 0.5969 and 0.6096 m. Intermediate heights
  // follow the side-elevation outline, levelled to those endpoint measurements.
  constant Real pontoon[12,4]=[-2.520,.090,.23078,-.01413; -1.829,.160,.17658,-.19662;
    -.876,.185,.13108,-.32376; .018,.185,.09300,-.37000; .697,.170,.08864,-.36619;
    1.531,.125,.12129,-.32188; 1.960,.092,.16218,-.25766; 2.222,.060,.19239,-.15398;
    2.353,.039,.21071,-.05985; 2.425,.027,.22181,.02938; 2.484,.015,.22656,.13093;
    2.520,.004,.22648,.21482];
  function pontoonSection
    input Real x;
    output Real profile[3];
  protected Real u;
  algorithm
    profile:=pontoon[1,2:4];
    for i in 1:11 loop
      u:=max(0,min(1,(x-pontoon[i,1])/(pontoon[i+1,1]-pontoon[i,1])));
      profile:=profile+u*(pontoon[i+1,2:4]-pontoon[i,2:4]);
    end for;
  end pontoonSection;
  function pontoonVertices "Closed cross-section rings following the measured Hobie hull"
    output Real vertices[96,3];
  protected
    constant Real profile[8,2]=[0,1;1,.92;.94,.60;.70,.24;0,0;-.70,.24;-.94,.60;-1,.92];
  algorithm
    for station in 1:12 loop
      for point in 1:8 loop
        vertices[8*(station-1)+point,:]:={pontoon[station,1],profile[point,1]*pontoon[station,2],
          pontoon[station,4]+profile[point,2]*(pontoon[station,3]-pontoon[station,4])};
      end for;
    end for;
  end pontoonVertices;

  function cruiserVertices "Closed hull loft in the cabin cruiser's forward, port and up frame"
    output Real vertices[96,3];
  protected
    constant Real stations[12,4]=[-3.74,1.07,.77,-.39; -3.53,1.19,.78,-.44; -2.75,1.29,.80,-.52;
      -1.55,1.36,.84,-.57; -.20,1.35,.91,-.61; 1.05,1.24,1.00,-.58; 2.10,1.00,1.11,-.49;
      2.55,.85,1.16,-.41; 2.93,.67,1.20,-.32; 3.24,.49,1.24,-.20; 3.49,.33,1.27,-.06; 3.80,.018,1.32,.25];
    constant Real section[8,2]=[0,1;1,1;.972,.65;.85,.23;0,0;-.85,.23;-.972,.65;-1,1];
    Real x,w,top,keel,rake,round,drop,f,t;
  algorithm
    for i in 1:12 loop
      x:=stations[i,1];w:=stations[i,2];top:=stations[i,3];keel:=stations[i,4];
      rake:=.8*max(0,(x-1.5)/2.3)^2;
      round:=.14*max(0,(-3.39-x)/.35);
      drop:=.18*min(1,max(0,(3.5-x)/2.1));
      for j in 1:8 loop
        f:=section[j,1];t:=section[j,2];
        vertices[8*(i-1)+j,:]:={x-rake*(1-t)+round*f^2,w*f,keel+(top-keel)*t-drop*max(0,1-t/.23)};
      end for;
    end for;
  end cruiserVertices;

  function cruiserCabinVertices "Pilothouse skin in the cruiser body frame"
    output Real vertices[38,3];
  protected
    // Lower side, side glazing, windshield pillars and the roof rim.
    // The aft opening is left clear between the two quarter panels.
    constant Real port[19,3]=[
      -1.85,1.06,.77; -1.63,1.01,1.14; -1.18,1.05,.79; -1.12,.99,1.24;
      -.84,1.05,.82; -.83,1,1.34; .50,.98,.94; .50,.94,1.57;
      1.26,.88,1; 1.19,.85,1.65; 1.82,.65,1.10; 1.83,.64,1.19;
      .63,.83,2.09; -.35,.89,2.14; -1.21,.90,2.15; 2.04,.48,1.10;
      -1.33,.97,1.68; .80,.87,2.18; -.98,1.02,2.18];
  algorithm
    for i in 1:19 loop
      vertices[i,:]:=port[i,:];
      vertices[i+19,:]:={port[i,1],-port[i,2],port[i,3]};
    end for;
  end cruiserCabinVertices;

  function cruiserCabinFaces "Indexed two-sided cabin triangles"
    output Integer faces[46,3];
  protected
    constant Integer side[17,3]=[
      1,3,2; 2,3,4; 3,5,4; 4,5,6; 5,7,6; 6,7,8; 7,9,8;
      8,9,10; 9,11,10; 10,11,12; 6,10,14; 14,10,13; 2,4,17;
      4,15,17; 13,18,14; 14,18,19; 14,19,15];
    constant Integer across[6,2]=[10,13;10,12;12,16;13,18;18,19;19,15];
  algorithm
    for i in 1:17 loop
      faces[i,:]:=side[i,:];
      faces[i+17,:]:={side[i,1]+19,side[i,3]+19,side[i,2]+19};
    end for;
    for i in 1:6 loop
      faces[33+2*i,:]:={across[i,1],across[i,1]+19,across[i,2]};
      faces[34+2*i,:]:={across[i,2],across[i,1]+19,across[i,2]+19};
    end for;
  end cruiserCabinFaces;

  function pontoonFace "One oriented triangle on the lofted pontoon shell"
    input Integer index;
    output Integer face[3];
  protected
    Integer triangle,a,b,i;
  algorithm
    triangle:=index-1;
    if triangle<176 then
      a:=8*div(triangle,16)+1+mod(div(triangle,2),8);
      b:=8*div(triangle,16)+1+mod(div(triangle,2)+1,8);
      face:=if mod(triangle,2)==0 then {a,b+8,b} else {a,a+8,b+8};
    else
      i:=2+div(triangle-176,2);
      face:=if mod(triangle,2)==0 then {1,i,i+1} else {89,89+i,88+i};
    end if;
  end pontoonFace;

  function pontoonFaces
    output Integer faces[188,3];
  algorithm
    faces:={pontoonFace(index) for index in 1:188};
  end pontoonFaces;

  function committeeVertices "Committee launch hull in its forward, port and up frame"
    output Real vertices[42,3];
  protected
    constant Real stations[6,2]=[-3,.88;-2.7,1.02;-.7,1.10;1,1.01;2.1,.72;3.2,.025];
    constant Real section[7,2]=[1,.78;.91,.24;.58,-.13;0,-.30;-.58,-.13;-.91,.24;-1,.78];
  algorithm
    for i in 1:6 loop
      for j in 1:7 loop
        vertices[7*(i-1)+j,:]:={stations[i,1],stations[i,2]*section[j,1],section[j,2]+.12*max(0,stations[i,1]-1)};
      end for;
    end for;
  end committeeVertices;

  function committeeFaces "Outward-facing triangles closing the deck, hull, and transoms"
    output Integer faces[80,3];
  protected
    Integer a,b,k;
  algorithm
    faces:=fill(0,80,3);
    for i in 1:5 loop
      for j in 1:7 loop
        a:=7*(i-1)+j;
        b:=7*(i-1)+1+mod(j,7);
        k:=14*(i-1)+2*(j-1)+1;
        faces[k,:]:={a,b+7,b};
        faces[k+1,:]:={a,a+7,b+7};
      end for;
    end for;
    for i in 1:5 loop
      faces[70+i,:]:={1,i+1,i+2};
      faces[75+i,:]:={36,37+i,36+i};
    end for;
  end committeeFaces;

  function boxVertices
    input Real center[3],half[3];
    output Real vertices[8,3];
  algorithm
    for i in 1:8 loop
      vertices[i,:]:=center+{
        (2*mod(i-1,2)-1)*half[1],(2*mod(div(i-1,2),2)-1)*half[2],(2*div(i-1,4)-1)*half[3]};
    end for;
  end boxVertices;

  function boxFaces
    output Integer faces[12,3];
  algorithm
    faces:=[1,3,2;2,3,4;5,6,7;6,8,7;1,2,5;2,6,5;3,7,4;4,7,8;1,5,3;3,5,7;2,4,6;4,8,6];
  end boxFaces;

  function committeeFittings "Solid shelter roof, console and motor housing"
    output Real vertices[3,8,3];
  algorithm
    vertices[1,:,:]:=boxVertices({0,0,1.16},{.475,.38,.43});
    vertices[2,:,:]:=boxVertices({0,0,2.32},{.925,.725,.04});
    vertices[3,:,:]:=boxVertices({-3.13,0,.58},{.26,.24,.34});
  end committeeFittings;

  function committeeGap
    input Real p[3],vertices[42,3],margin;
    input Integer faces[80,3];
    output Real result[4];
  algorithm
    result:={1e3,0,0,0};
    if abs(p[2])>1.10+margin or p[1]< -3-margin or p[1]>3.2+margin or p[3]< -.30-margin or p[3]>1.044+margin then
      return;
    end if;
    result:=hullMeshGap(p,vertices,faces);
    if result[1]<0 and not insideHull(p,vertices,faces) then
      result:=-result;
    end if;
  end committeeGap;

  function droneParts "Low-poly convex airframe, arms, and landing struts in RDD2 body FLU"
    output Real vertices[9,8,3];
  protected
    Real sx,sy,along,across;
  algorithm
    vertices:=zeros(9,8,3);
    vertices[1,:,:]:=boxVertices({.026,0,-.037},{.149,.085,.048});
    for i in 1:8 loop
      if i<=4 then
        vertices[1,i,2]:=.85*vertices[1,i,2];
      else
        vertices[1,i,1]:=.94*vertices[1,i,1];
      end if;
    end for;
    for k in 1:4 loop
      sx:=if k<=2 then 1 else -1;
      sy:=if mod(k,2)==0 then 1 else -1;
      for i in 1:8 loop
        along:=mod(i-1,2);
        across:=(2*mod(div(i-1,2),2)-1)*.017;
        vertices[1+k,i,:]:={sx*(.054+.111*along)-sy*across,sy*(.066+.128*along)+sx*across,-.066+.018*along+.026*div(i-1,4)};
      end for;
      vertices[5+k,:,:]:=boxVertices({.156*sx,.195*sy,-.052},{.023,.024,.052});
    end for;
  end droneParts;
  function closestEdge
    input Real p[3],a[3],b[3];
    output Real closest[3];
  protected Real edge[3],u;
  algorithm
    edge:=b-a;
    u:=min(1,max(0,(p-a)*edge/max(1e-12,edge*edge)));
    closest:=a+u*edge;
  end closestEdge;

  function pontoonGap "Signed distance and normal of the nearest face of the closed triangle mesh"
    input Real p[3],vertices[96,3],margin;
    input Integer faces[188,3];
    output Real result[4];
  algorithm
    result:={1e3,0,0,0};
    if abs(p[2])>.2+margin or p[1]< -2.52-margin or p[1]>2.52+margin or p[3]< -.38-margin or p[3]>.24+margin then
      return;
    end if;
    result:=hullMeshGap(p,vertices,faces);
  end pontoonGap;

  function cruiserGap "Signed gap to the cruiser's triangulated hull with local broad phase"
    input Real p[3],vertices[96,3],margin;
    input Integer faces[188,3];
    output Real result[4];
  algorithm
    result:={1e3,0,0,0};
    if abs(p[2])>1.37+margin or p[1]< -3.74-margin or p[1]>3.80+margin or p[3]< -.80-margin or p[3]>1.32+margin then
      return;
    end if;
    result:=hullMeshGap(p,vertices,faces);
    // At an edge the nearest triangle's plane can put an exterior point
    // on its negative side. Test the closed shell before treating it as penetration.
    if result[1]<0 and not insideHull(p,vertices,faces) then
      result:=-result;
    end if;
  end cruiserGap;

  function insideHull "Ray parity through a watertight hull, with a submicrometre edge offset"
    input Real p[3],vertices[:,3];
    input Integer faces[:,3];
    output Boolean inside;
  protected
    Real a[3],b[3],c[3],y,z,det,u,v;
  algorithm
    inside:=false;
    y:=p[2]+1e-8;z:=p[3]+1.4142e-8;
    for i in 1:size(faces,1) loop
      a:=vertices[faces[i,1],:];b:=vertices[faces[i,2],:];c:=vertices[faces[i,3],:];
      if max(a[1],max(b[1],c[1]))>p[1] and y>=min(a[2],min(b[2],c[2])) and y<=max(a[2],max(b[2],c[2]))
        and z>=min(a[3],min(b[3],c[3])) and z<=max(a[3],max(b[3],c[3])) then
        b:=b-a;c:=c-a;
        det:=b[2]*c[3]-b[3]*c[2];
        if abs(det)>1e-12 then
          u:=((y-a[2])*c[3]-(z-a[3])*c[2])/det;
          v:=(b[2]*(z-a[3])-b[3]*(y-a[2]))/det;
          if u>=0 and v>=0 and u+v<1 and a[1]+u*b[1]+v*c[1]>p[1] then
            inside:=not inside;
          end if;
        end if;
      end if;
    end for;
  end insideHull;

  function hullMeshGap "Distance and contact normal at the nearest triangle"
    input Real p[3],vertices[:,3];
    input Integer faces[:,3];
    input Boolean twoSided=false;
    output Real result[4];
  protected
    Real a[3],b[3],c[3],n[3],q[3],edge[3],delta[3],gap,best,d2,sgn,normal[3];
  algorithm
    best:=1e6;sgn:=1;normal:={0,0,1};
    for i in 1:size(faces,1) loop
      a:=vertices[faces[i,1],:];b:=vertices[faces[i,2],:];c:=vertices[faces[i,3],:];
      gap:=max(0,max(min(a[1],min(b[1],c[1]))-p[1],p[1]-max(a[1],max(b[1],c[1]))));
      if gap*gap<best then
        n:=cross(b-a,c-a);
        n:=n/sqrt(max(1e-12,n*n));
        gap:=(p-a)*n;
        q:=p-gap*n;
        if cross(b-a,q-a)*n<0 or cross(c-b,q-b)*n<0 or cross(a-c,q-c)*n<0 then
          q:=closestEdge(p,a,b);
          edge:=closestEdge(p,b,c);
          if (p-edge)*(p-edge)<(p-q)*(p-q) then q:=edge;end if;
          edge:=closestEdge(p,c,a);
          if (p-edge)*(p-edge)<(p-q)*(p-q) then q:=edge;end if;
        end if;
        delta:=p-q;d2:=delta*delta;
        if d2<best then
          best:=d2;sgn:=if twoSided or gap>=0 then 1 else -1;
          normal:=if d2>1e-10 then sgn*delta/sqrt(d2) else n;
        end if;
      end if;
    end for;
    result:=cat(1,{sgn*sqrt(best)},normal);
  end hullMeshGap;
  function smoothStep
    input Real x;
    output Real blend;
  protected Real u;
  algorithm
    u:=max(0,min(1,x));
    blend:=u*u*(3-2*u);
  end smoothStep;
  function terrain "Sand slope with a zero-slope join to the surrounding seabed"
    input Real x,y;
    output Real z;
  protected Real height;
  algorithm
    height:=17.3-4.2*((x/17)^2+(y/11)^2)+.34*sin(x*.64)*cos(y*.55)+.37*cos(.34*x-.51*y);
    z:=-13.7+max(0,height)*smoothStep(height/.8)*smoothStep((29-abs(x))/7)*smoothStep((23-abs(y))/7);
  end terrain;

  function seabed "Upper surface of the sand mesh and surrounding level bottom"
    input Real east,north;
    output Real height;
  protected
    Real x,y,h,t,u,v;
    constant Real dx=58/74,dy=46/62;
  algorithm
    x:=east-36;y:=north-40;height:=-13.7;
    if abs(x)<=29 and abs(y)<=23 then
      h:=-29+dx*floor((x+29)/dx);t:=-23+dy*floor((y+23)/dy);
      u:=(x-h)/dx;v:=(y-t)/dy;
      height:=max(height,if u+v<=1 then (1-u-v)*terrain(h,t)+u*terrain(h+dx,t)+v*terrain(h,t+dy)
        else (u+v-1)*terrain(h+dx,t+dy)+(1-v)*terrain(h+dx,t)+(1-u)*terrain(h,t+dy));
    end if;
  end seabed;
  // Pass the mesh tables once so each indexed lookup uses the same immutable data.
  function rockSurface "Deepest boulder surface inside the broad-phase bounds"
    input Real pos[3],sand[4],boulders[46,13],facets[80,4];
    output Real surface[4] "Normal and signed clearance";
  protected
    Real delta[3],gradient[3],local[3],inv[3,3],bestNormal[3],normal[3],distance,highest,clearance;
    Integer facet;
  algorithm
    normal:=sand[1:3];clearance:=sand[4];
    for rock in 1:46 loop
      delta:=pos-boulders[rock,1:3];
      if delta*delta<boulders[rock,4]^2 then
        inv:=[boulders[rock,5],boulders[rock,6],boulders[rock,7];
          boulders[rock,8],boulders[rock,9],boulders[rock,10];
          boulders[rock,11],boulders[rock,12],boulders[rock,13]];
        local:=inv*delta;highest:=-1e6;bestNormal:={0,0,1};facet:=1;
        while facet<=80 and highest<min(0,clearance) loop
          gradient:=transpose(inv)*facets[facet,1:3];
          distance:=(facets[facet,1:3]*local-facets[facet,4])/sqrt(gradient*gradient);
          if distance>highest then highest:=distance;bestNormal:=gradient/sqrt(gradient*gradient);end if;
          facet:=facet+1;
        end while;
        if highest<min(0,clearance) then clearance:=highest;normal:=bestNormal;end if;
      end if;
    end for;
    surface:={normal[1],normal[2],normal[3],clearance};
  end rockSurface;
  function aboveFlatBottom "Conservative sphere clear of both the island mesh and the level seabed"
    input Real east,north,z,radius;
    output Boolean clear;
  algorithm
    clear:=z-radius> -13.7 and (abs(east-36)>29+radius or abs(north-40)>23+radius);
  end aboveFlatBottom;
  function skinContact "Compressive terrain force on one swimmer skin point, in level heading axes"
    input Real pos[3],cy,sy,velocity[3],damping,radius=0;
    output Real contact[5] "Force XYZ, normal load, signed clearance";
  protected
    constant Real dx=58/74,dy=46/62;
    Real surface[4],normal[3],n[3],slip[3],force[3],east,north,h,t,u,v,height,clearance,load,support,normalSpeed;
  algorithm
    east:=pos[1]-36;north:=pos[2]-40;height:=-13.7;normal:={0,0,1};
    if abs(east)<=29 and abs(north)<=23 then
      h:=-29+dx*floor((east+29)/dx);t:=-23+dy*floor((north+23)/dy);
      u:=(east-h)/dx;v:=(north-t)/dy;
      if u+v<=1 then
        height:=terrain(h,t);
        normal:={-(terrain(h+dx,t)-height)/dx,-(terrain(h,t+dy)-height)/dy,1};
        height:=height-normal[1]*(east-h)-normal[2]*(north-t);
      else
        height:=terrain(h+dx,t+dy);
        normal:={-(height-terrain(h,t+dy))/dx,-(height-terrain(h+dx,t))/dy,1};
        height:=height-normal[1]*(east-h-dx)-normal[2]*(north-t-dy);
      end if;
      if height< -13.7 then height:=-13.7;normal:={0,0,1};end if;
    end if;
    normal:=normal/sqrt(normal*normal);clearance:=(pos[3]-height)*normal[3];
    if abs(east)<22 and abs(north)<15 and abs(pos[3])<6 then
      surface:=rockSurface(pos,{normal[1],normal[2],normal[3],clearance},rocks,planes);
      normal:=surface[1:3];clearance:=surface[4];
    end if;
    clearance:=clearance-radius;
    force:=zeros(3);load:=0;
    if clearance<0 then
      n:={cy*normal[1]+sy*normal[2],-sy*normal[1]+cy*normal[2],normal[3]};
      normalSpeed:=velocity*n;slip:=velocity-normalSpeed*n;
      // Cap the overlap correction speed to dissipate an impact, including a deeply overlapping reset.
      support:=damping*min(5,-28*clearance);
      load:=max(0,support-damping*min(1,-clearance/.015)*normalSpeed-max(0,support/.55-damping)*max(0,normalSpeed));
      force:=load*(n-.48*slip/sqrt(.2^2+slip*slip));
    end if;
    contact:={force[1],force[2],force[3],load,clearance};
  end skinContact;
  function contact
    input Real pos[3],heading,rotation[3,3],velocity[3],spin[3],xs[7],widths[7],spacing;
    output Real wrench[6] "Force and moment in the level heading frame";
  algorithm
    if abs(pos[1]-36)>31 or abs(pos[2]-40)>26 then
      wrench:=zeros(6);
    else
      wrench:=islandContact(pos,heading,rotation,velocity,spin,xs,widths,spacing,rocks,planes);
    end if;
  end contact;
  function islandContact "Sand and boulder contact within the island bounds"
    input Real pos[3],heading,rotation[3,3],velocity[3],spin[3],xs[7],widths[7],spacing;
    input Real boulders[46,13],facets[80,4];
    output Real wrench[6] "Force and moment in the level heading frame";
  protected
    Real arm[3],p[3],normal[3],delta[3],n[3],v[3],slip[3],force[3],localPoint[3];
    Real x,y,h,t,z,dx,dy,penetration,d,support,weight,along,beam,depth,highest;
    Integer nearby[46],count,r,f;
    Real reach,maxBeam;
    Real ch,sh,profile[3],inv[3,3],q[3],gradient[3],magnitude;
  algorithm
    wrench:=zeros(6);
    ch:=cos(heading);sh:=sin(heading);
    // A rotation preserves distance from the hull origin. Screen rocks
    // once for the whole vessel before testing the unchanged hull samples.
    maxBeam:=max(abs(widths));
    reach:=sqrt(max(abs(xs))^2+(abs(spacing)+.69*max(maxBeam,max(pontoon[:,2])))^2
      +max(max(abs(pontoon[:,3:4])),.19*(.48+1.55*maxBeam))^2);
    nearby:=fill(0,46);count:=0;
    for rock in 1:46 loop
      delta:=pos-boulders[rock,1:3];
      if delta*delta<(reach+boulders[rock,4])^2 then
        count:=count+1;
        nearby[count]:=rock;
      end if;
    end for;
    for hull in 1:(if spacing>0 then 2 else 1) loop
      for j in 1:13 loop
        along:=.5*(xs[div(j+1,2)]+xs[div(j+2,2)]);
        beam:=.5*(widths[div(j+1,2)]+widths[div(j+2,2)]);
        profile:=pontoonSection(along);
        for side in -1:1 loop
          depth:=if spacing>0 then profile[2]+(profile[3]-profile[2])*(if side==0 then 1 else .77)
            else -.19*(.48+1.55*beam)*(if side==0 then 1 else .77);
          localPoint:={along,(3-2*hull)*spacing+side*.69*(if spacing>0 then profile[1] else beam),depth};
          arm:=rotation*localPoint;
          p:=pos+{ch*arm[1]-sh*arm[2],sh*arm[1]+ch*arm[2],arm[3]};
          x:=p[1]-36;y:=p[2]-40;
          // Same triangles and diagonal as the 74 x 62 rendered sand grid.
          dx:=58/74;dy:=46/62;
          h:=-29+dx*floor((x+29)/dx);t:=-23+dy*floor((y+23)/dy);
          if (x-h)/dx+(y-t)/dy<=1 then
            z:=terrain(h,t);
            normal:={-(terrain(h+dx,t)-z)/dx,-(terrain(h,t+dy)-z)/dy,1};
            z:=z-normal[1]*(x-h)-normal[2]*(y-t);
          else
            z:=terrain(h+dx,t+dy);
            normal:={-(z-terrain(h,t+dy))/dx,-(z-terrain(h+dx,t))/dy,1};
            z:=z-normal[1]*(x-h-dx)-normal[2]*(y-t-dy);
          end if;
          penetration:=(z-p[3])/sqrt(normal*normal);normal:=normal/sqrt(normal*normal);
          for candidate in 1:count loop
            r:=nearby[candidate];
            delta:=p-boulders[r,1:3];
            if delta*delta<boulders[r,4]^2 then
              inv:=[boulders[r,5],boulders[r,6],boulders[r,7];boulders[r,8],boulders[r,9],boulders[r,10];boulders[r,11],boulders[r,12],boulders[r,13]];
              q:=inv*delta;highest:=-1e6;n:={0,0,1};
              f:=1;
              // One separating plane rules out a stronger contact at this point.
              while f<=80 and highest < -max(0,penetration) loop
                gradient:=transpose(inv)*facets[f,1:3];magnitude:=sqrt(gradient*gradient);
                d:=(facets[f,1:3]*q-facets[f,4])/magnitude;
                if d>highest then highest:=d;n:=gradient/magnitude;end if;
                f:=f+1;
              end while;
              if -highest>penetration then penetration:=-highest;normal:=n;end if;
            end if;
          end for;
          if penetration>0 then
            n:={ch*normal[1]+sh*normal[2],-sh*normal[1]+ch*normal[2],normal[3]};
            v:=velocity+cross(spin,arm);slip:=v-(v*n)*n;
            weight:=if spacing>0 then 1 else .65;
            support:=weight*max(0,15000*penetration-520*(v*n));
            force:=support*(n-.48*slip/sqrt(.08^2+slip*slip));
            wrench[1:3]:=wrench[1:3]+force;wrench[4:6]:=wrench[4:6]+cross(arm,force);
          end if;
        end for;
      end for;
    end for;
  end islandContact;
end Shore;
