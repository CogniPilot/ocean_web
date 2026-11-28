package Shore "Beach and convex shoreline boulders in east, north, up coordinates"
  import Geometry = .Collision;
  import Collision = .Collision;
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
    constant Real stations[12,4]=[-3.74,1.22,.80,-.49;-3.53,1.38,.82,-.56;-2.75,1.55,.87,-.67;
      -1.55,1.615,.92,-.73;-.20,1.61,.96,-.76;1.05,1.55,1.02,-.72;2.10,1.42,1.11,-.61;
      2.85,1.29,1.17,-.55;3.52,1.11,1.22,-.45;4.30,.83,1.27,-.25;4.94,.51,1.31,.02;5.48,.015,1.35,.32];
    constant Real section[8,2]=[0,1;1,1;.972,.65;.85,.23;0,0;-.85,.23;-.972,.65;-1,1];
    Real x,w,top,keel,rake,round,chine,f,t;
  algorithm
    for i in 1:12 loop
      x:=stations[i,1];w:=stations[i,2];top:=stations[i,3];keel:=stations[i,4];
      rake:=1.18*max(0,(x-1.5)/3.98)^2;
      round:=.14*max(0,(-3.39-x)/.35);
      chine:=keel+.85*w*tan(21*Modelica.Constants.pi/180);
      for j in 1:8 loop
        f:=section[j,1];t:=section[j,2];
        vertices[8*(i-1)+j,:]:={x-rake*(1-t)+round*f^2,w*f,
          if t<.23 then keel+(chine-keel)*t/.23 else chine+(top-chine)*(t-.23)/.77};
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
    // Sheer, outer chine, inner strake and keel offsets from the CAD stations.
    constant Real stationWidths[6]={.90,1.10,1.215,1.18,.84,.03};
    constant Real sectionBeam[7]={1,.88,.54,0,-.54,-.88,-1};
    constant Real stationX[6,4]=[-2.91,-2.64084,-2.60574,-2.55;-2.59,-2.43890,-2.42288,-2.38360;
      -.65,-.65,-.65,-.65;1,1,1,1;2.10,2.00848,1.97798,1.93944;2.98,2.6038,2.4784,2.32];
    constant Real stationZ[6,4]=[.78,.10710,.01936,-.12;.775,.11978,.05033,-.12;.78,.044,.003,-.12;
      .82,.182,.07071,-.112;.91,.491,.30506,.130;1.018,.64839,.53916,.405];
    Integer profile;
  algorithm
    for i in 1:6 loop
      for j in 1:7 loop
        profile:=4-abs(4-j);
        vertices[7*(i-1)+j,:]:={stationX[i,profile],stationWidths[i]*sectionBeam[j],stationZ[i,profile]};
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

  constant Real committeePadCenter[3]={0,0,2.36};
  constant Real committeePadHalf[2]={.80,.62};
  constant Real committeeRoofHalf[2]={.925,.725};
  constant Real committeeMastX=2.58;
  constant Real committeeMastTop=4 "Start/finish sighting point height in the committee boat frame";
  constant Real committeeBoard[5]={1.47,.58,-.17,.58,1.96} "Width, height and positive-side center of the course board";
  constant Integer committeeFittingCount=17;

  function committeeFittings "Shelter, motor, mast, roof supports and course boards"
    output Real vertices[committeeFittingCount,8,3];
  algorithm
    vertices[1,:,:]:=boxVertices({0,0,1.16},{.475,.38,.43});
    vertices[2,:,:]:=boxVertices(committeePadCenter-{0,0,.04},cat(1,committeeRoofHalf,{.04}));
    vertices[3,:,:]:=boxVertices({-3.20,0,.804},{.322,.265,.277});
    vertices[4,:,:]:=boxVertices({committeeMastX,0,2.495},{.033,.033,1.505});
    for i in 1:2 loop
      for j in 1:2 loop
        vertices[4+2*(i-1)+j,:,:]:=boxVertices({if i==1 then -.75 else .55,if j==1 then -.53 else .53,1.555},{.027,.027,.765});
      end for;
      vertices[8+i,:,:]:=boxVertices({committeeBoard[3],(2*i-3)*committeeBoard[4],committeeBoard[5]},
        {.5*committeeBoard[1],.012,.5*committeeBoard[2]});
    end for;
    vertices[11,:,:]:=boxVertices({.359,0,1.732},{.064,.352,.188});
    // The outboard's mast-height powerhead, midsection, drive leg and gearcase
    // use separate envelopes so the space on either side of the leg stays open.
    vertices[12,:,:]:=boxVertices({-3.22,0,.347},{.19,.146,.18});
    vertices[13,:,:]:=boxVertices({-3.22,0,-.069},{.13,.087,.312});
    vertices[14,:,:]:=boxVertices({-3.324,0,-.562},{.21,.10,.24});
    vertices[15,:,:]:=boxVertices({1.70,0,.70},{.45,.63,.10});
    vertices[16,:,:]:=boxVertices({-1.30,0,1.04},{.36,.56,.26});
    vertices[17,:,:]:=boxVertices({-2.42,0,.885},{.255,.67,.10});
  end committeeFittings;

  function committeeGap
    input Real p[3],vertices[42,3],margin;
    input Integer faces[80,3];
    output Real result[4];
  algorithm
    result:={1e3,0,0,0};
    if abs(p[2])>1.215+margin or p[1]< -2.91-margin or p[1]>2.98+margin or p[3]< -.49-margin or p[3]>1.018+margin then
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
  function closestEdge = Geometry.closestSegmentPoint;

  function pontoonGap "Signed distance and normal of the nearest face of the closed triangle mesh"
    input Real p[3],vertices[96,3],margin;
    input Integer faces[188,3];
    input Boolean orderedRings=false "Vertices and faces follow pontoonVertices and pontoonFaces order";
    output Real result[4];
  protected
    Integer nearest,firstRing,lastRing;
    Real bound2,dx,delta[3],distance;
  algorithm
    result:={1e3,0,0,0};
    if abs(p[2])>.2+margin or p[1]< -2.52-margin or p[1]>2.52+margin or p[3]< -.38-margin or p[3]>.24+margin then
      return;
    end if;
    if not orderedRings then
      result:=hullMeshGap(p,vertices,faces);
      return;
    end if;
    // Any hull vertex is an upper bound for the nearest point. A section
    // outside this longitudinal search interval cannot contain that point.
    nearest:=1;
    for station in 2:12 loop
      if abs(vertices[8*(station-1)+1,1]-p[1])<abs(vertices[8*(nearest-1)+1,1]-p[1]) then
        nearest:=station;
      end if;
    end for;
    bound2:=1e6;
    for vertex in 1:8 loop
      delta:=vertices[8*(nearest-1)+vertex,:]-p;
      bound2:=min(bound2,delta*delta);
    end for;
    distance:=sqrt(bound2)+1e-9;
    firstRing:=1;lastRing:=11;
    for station in 2:11 loop
      dx:=vertices[8*(station-1)+1,1]-p[1];
      if dx< -distance then firstRing:=station;end if;
      if dx>distance then lastRing:=min(lastRing,station-1);end if;
    end for;
    result:=hullMeshGap(p,vertices,faces,false,16*(firstRing-1)+1,16*lastRing,177);
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

  function insideHull = Geometry.insideTriangleMesh;

  function hullMeshGap = Geometry.triangleMeshGap;
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

  function seabed "Upper surface of the island sand mesh or the harbor bed"
    input Real east,north;
    output Real height;
  protected
    Real x,y,h,t,u,v,normal[3];
    constant Real dx=58/74,dy=46/62;
  algorithm
    x:=east-36;y:=north-40;(height,normal):=Wreck.Bathymetry.plane(east,north);
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
    input Boolean candidates[46]=fill(true,46);
    output Real surface[4] "Normal and signed clearance";
  protected
    Real inv[3,3],normal[3],clearance;
    Geometry.ContactPoint hit;
  algorithm
    normal:=sand[1:3];clearance:=sand[4];
    for rock in 1:46 loop
      if candidates[rock] and Geometry.sphereBoundsOverlap(pos,0,boulders[rock,1:3],boulders[rock,4]) then
        inv:=[boulders[rock,5],boulders[rock,6],boulders[rock,7];
          boulders[rock,8],boulders[rock,9],boulders[rock,10];
          boulders[rock,11],boulders[rock,12],boulders[rock,13]];
        hit:=Geometry.pointConvexPlanes(pos-boulders[rock,1:3],inv,facets,min(0,clearance));
        if hit.gap<min(0,clearance) then clearance:=hit.gap;normal:=hit.n;end if;
      end if;
    end for;
    surface:={normal[1],normal[2],normal[3],clearance};
  end rockSurface;

  function rockCandidates "Boulders that can overlap an entire rigid body's bounding sphere"
    input Real position[3],radius;
    output Boolean candidates[46];
    output Real highest "Upper bound of the selected boulders";
  algorithm
    highest:=-13.7;
    for i in 1:46 loop
      candidates[i]:=Geometry.sphereBoundsOverlap(position,radius,rocks[i,1:3],rocks[i,4]);
      if candidates[i] then highest:=max(highest,rocks[i,3]+rocks[i,4]);end if;
    end for;
  end rockCandidates;
  function aboveFlatBottom "Conservative sphere clear of both the island mesh and the level seabed"
    input Real east,north,z,radius;
    output Boolean clear;
  algorithm
    clear:=z-radius> -13.7 and (abs(east-36)>29+radius or abs(north-40)>23+radius);
  end aboveFlatBottom;
  function sandHeightUpperBound "Upper bound on interpolated sand height inside a horizontal footprint"
    input Real east,north,radius;
    output Real height;
  protected
    Real x,y;
  algorithm
    // Include all possible vertices of the triangles under this footprint.
    x:=max(0,abs(east-36)-radius-58/74);y:=max(0,abs(north-40)-radius-46/62);
    height:=max(-13.7,4.31-4.2*((x/17)^2+(y/11)^2));
  end sandHeightUpperBound;
  function clearOfShore "Conservative clearance for a footprint with known lowest elevation"
    input Real east,north,lowest,radius;
    output Boolean clear;
  protected
    Real dx,dy,r;
  algorithm
    clear:=false;
    if lowest<=-13.7 then return;end if;
    if abs(east-36)>29+radius or abs(north-40)>23+radius then clear:=true;return;end if;
    if lowest<=sandHeightUpperBound(east,north,radius) then return;end if;
    for i in 1:46 loop
      r:=rocks[i,4];
      if lowest<=rocks[i,3]+r then
        dx:=east-rocks[i,1];dy:=north-rocks[i,2];
        if dx*dx+dy*dy<=(radius+r)^2 then return;end if;
      end if;
    end for;
    clear:=true;
  end clearOfShore;
  function skinContact "Compressive terrain force on one swimmer skin point, in level heading axes"
    input Real pos[3],cy,sy,velocity[3],damping,radius=0;
    input Boolean candidates[46]=fill(true,46);
    output Real contact[5] "Force XYZ, normal load, signed clearance";
  protected
    constant Real dx=58/74,dy=46/62;
    Real surface[4],normal[3],n[3],slip[3],force[3],east,north,h,t,u,v,height,clearance,load,support,normalSpeed;
    Geometry.ContactPoint point;
  algorithm
    east:=pos[1]-36;north:=pos[2]-40;(height,normal):=Wreck.Bathymetry.plane(pos[1],pos[2]);
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
    normal:=normal/sqrt(normal*normal);
    point:=Geometry.planeSphere({pos[1],pos[2],height},normal,pos,zeros(3),0);
    clearance:=point.gap;
    if abs(east)<22 and abs(north)<15 and abs(pos[3])<6 then
      surface:=rockSurface(pos,{normal[1],normal[2],normal[3],clearance},rocks,planes,candidates);
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

  function hobiePlatform "Tessellated trampoline underside, crowned crossbeams and side rails"
    output Real corners[32,4,3];
  protected Real a,b,x0,x1,y,crown,sag;
    Integer k,index;
  algorithm
    corners:=zeros(32,4,3);
    // Four cloth panels each side follow the crown, central lacing and maximum 24 mm sag.
    for side in 1:2 loop
      for j in 1:2 loop
        for i in 1:2 loop
          index:=(side-1)*4+(j-1)*2+i;
          for corner in 1:4 loop
            a:=(i-1+(if corner==2 or corner==3 then 1 else 0))/2;
            b:=(j-1+(if corner>=3 then 1 else 0))/2;
            y:=(3-2*side)*(.04+.87*b);crown:=max(0,1-(y/1.02)^2);
            x0:=-1.225+(if b==1 then .105 else 0);
            x1:=.405+.035*crown-.047-(if b==1 then .105 else 0);
            sag:=.024*sin(Modelica.Constants.pi*a)*sin(Modelica.Constants.pi*b);
            corners[index,corner,:]:={x0+(x1-x0)*a,y,.414+a^3*.033*crown-sag};
          end for;
        end for;
      end for;
    end for;
    // Square-ring approximations of the elliptical frame extrusions. Opposite faces
    // remain separate so the open water forward and aft of the platform stays clear.
    for beam in 1:4 loop
      for side in 1:4 loop
        for section in 1:(if beam<=2 then 2 else 1) loop
          index:=if beam<=2 then 8+(beam-1)*8+(side-1)*2+section else 24+(beam-3)*4+side;
          for corner in 1:4 loop
            a:=if corner>=3 then 1 else 0;
            k:=mod(side-1+(if corner==2 or corner==3 then 1 else 0),4);
            b:=k*Modelica.Constants.pi/2;
            if beam<=2 then
              y:=-1.075+1.075*(section-1+a);crown:=if beam==1 then max(0,1-(y/1.02)^2) else 0;
              corners[index,corner,:]:={(if beam==1 then .405+.035*crown else -1.4)+.056*cos(b),y,.41+.033*crown+.05*sin(b)};
            else
              corners[index,corner,:]:={-1.4+1.805*a,(if beam==3 then .938 else -.938)+.042*cos(b),.413+.034*sin(b)};
            end if;
          end for;
        end for;
      end for;
    end for;
  end hobiePlatform;

  function hobieRockContact "Finite boulder faces against both hulls and the bridging platform"
    input Real pos[3],heading,rotation[3,3],velocity[3],spin[3],spacing;
    input Real platform[32,4,3],vertices[96,3];
    input Integer faces[188,3];
    input Real boulders[46,13],facets[80,4];
    output Real wrench[6];
  protected
    Real bodyToWorld[3,3],inv[3,3],bodyNormals[3,3],face[80,4],tri[3,3],radius;
    Real delta[3],center[3],gradient[3],normal[3],arm[3],force[3],distance,scale;
    Collision.ContactPoint hit,best,point;
    Collision.Material rock(k=100000,d=1.5,mu=.42,eps=1e-6,v_eps=.08);
    Integer corner;
  algorithm
    wrench:=zeros(6);
    tri:=zeros(3,3);face:=zeros(80,4);
    bodyToWorld:=[cos(heading),-sin(heading),0;sin(heading),cos(heading),0;0,0,1]*rotation;
    for r in 1:46 loop
      delta:=boulders[r,1:3]-pos;radius:=boulders[r,4];
      if delta*delta<(2.85+radius)^2 then
        center:=transpose(bodyToWorld)*delta;
        inv:=[boulders[r,5],boulders[r,6],boulders[r,7];boulders[r,8],boulders[r,9],boulders[r,10];boulders[r,11],boulders[r,12],boulders[r,13]];
        bodyNormals:=transpose(inv*bodyToWorld);
        for f in 1:80 loop
          gradient:=bodyNormals*facets[f,1:3];scale:=sqrt(gradient*gradient);
          face[f,1:3]:=gradient/scale;
          face[f,4]:=(facets[f,4]+gradient*center)/scale;
        end for;
        best:=Collision.ContactPoint(0,zeros(3),zeros(3),zeros(3));
        for surface in 1:3 loop
          if surface==1 or abs(center[2]-(5-2*surface)*spacing)<=radius+.20 then
            for j in 1:(if surface==1 then 64 else 188) loop
              for k in 1:3 loop
                if surface==1 then
                  corner:=if mod(j,2)==1 or k==1 then k else k+1;
                  tri[k,:]:=platform[div(j+1,2),corner,:];
                else
                  tri[k,:]:=vertices[faces[j,k],:]+{0,(5-2*surface)*spacing,0};
                end if;
              end for;
              distance:=0;
              for axis in 1:3 loop
                distance:=distance+max(0,max(min(tri[:,axis])-center[axis],center[axis]-max(tri[:,axis])))^2;
              end for;
              if distance<radius^2 then
                hit:=Collision.triangleConvex(tri,face,center);
                if hit.gap<best.gap then best:=hit;end if;
              end if;
            end for;
          end if;
        end for;
        if best.gap<0 then
          normal:=rotation*best.n;arm:=rotation*best.armA;
          point:=Collision.ContactPoint(best.gap,normal,arm,rotation*best.armB);
          force:=Collision.contactForce(point,velocity+cross(spin,arm),rock);
          wrench[1:3]:=wrench[1:3]+force;wrench[4:6]:=wrench[4:6]+cross(arm,force);
        end if;
      end if;
    end for;
    annotation(Inline=false);
  end hobieRockContact;

  function orient2 "Signed area of a projected triangle, multiplied by two"
    input Real a[2],b[2],c[2];
    output Real value;
  algorithm
    value:=(b[1]-a[1])*(c[2]-a[2])-(b[2]-a[2])*(c[1]-a[1]);
  end orient2;

  function sandTriangleWitness "Deepest compressive witness in the overlap of a hull and sand triangle"
    input Real hull[3,3],sand[3,2],normal[3],offset;
    output Real best[4] "Penetration, then the hull witness position";
  protected
    Real projected[3,2]=hull[:,1:2];
    Real det,penetration,u,v,crossing,depth;
    Real p[3],q[2],a[2],b[2],c[2],d[2];
    Integer nextI,nextJ;
  algorithm
    best:=zeros(4);
    det:=orient2(projected[1,:],projected[2,:],projected[3,:]);
    if det>=-1e-10 or (cross(hull[2,:]-hull[1,:],hull[3,:]-hull[1,:])*normal)>=0 or
      min(hull*normal)>=offset then return;end if;
    // The height difference is affine over the projected intersection.
    // Its maximum occurs at an enclosed vertex or an edge crossing.
    for i in 1:3 loop
      q:=projected[i,:];p:=hull[i,:];
      penetration:=offset-p*normal;
      if penetration>best[1] and orient2(sand[1,:],sand[2,:],q)>=-1e-10 and
        orient2(sand[2,:],sand[3,:],q)>=-1e-10 and orient2(sand[3,:],sand[1,:],q)>=-1e-10 then
        best:=cat(1,{penetration},p);
      end if;
      q:=sand[i,:];
      u:=orient2(projected[1,:],q,projected[3,:])/det;
      v:=orient2(projected[1,:],projected[2,:],q)/det;
      if u>=-1e-10 and v>=-1e-10 and u+v<=1+1e-10 then
        depth:=hull[1,3]+u*(hull[2,3]-hull[1,3])+v*(hull[3,3]-hull[1,3]);
        p:=cat(1,q,{depth});penetration:=offset-p*normal;
        if penetration>best[1] then best:=cat(1,{penetration},p);end if;
      end if;
      nextI:=mod(i,3)+1;
      a:=projected[i,:];b:=projected[nextI,:]-a;
      for j in 1:3 loop
        nextJ:=mod(j,3)+1;
        c:=sand[j,:]-a;d:=sand[nextJ,:]-sand[j,:];
        crossing:=b[1]*d[2]-b[2]*d[1];
        if abs(crossing)>1e-12 then
          u:=(c[1]*d[2]-c[2]*d[1])/crossing;
          v:=(c[1]*b[2]-c[2]*b[1])/crossing;
          if u>=0 and u<=1 and v>=0 and v<=1 then
            p:=hull[i,:]+u*(hull[nextI,:]-hull[i,:]);penetration:=offset-p*normal;
            if penetration>best[1] then best:=cat(1,{penetration},p);end if;
          end if;
        end if;
      end for;
    end for;
    annotation(Inline=false);
  end sandTriangleWitness;

  function hobieSandManifold "Deepest triangle witness in each fore, center and aft pontoon segment"
    input Real pos[3],heading,rotation[3,3],spacing;
    input Real vertices[96,3];
    input Integer faces[188,3];
    output Real manifold[6,7] "Body anchor, world terrain normal, world plane offset";
  protected
    constant Real dx=58/74,dy=46/62;
    Real center[3],bodyToWorld[3,3],up[3],deepOffset;
    Real world[96,3],tri[3,3],lowest[3],highest[3],cell[3,2],support[4],deepest[4],deepNormal[3];
    Real x,y,z0,zE,zN,zEN,offset,length,ch,sh,reach,height;
    Integer i0,i1,j0,j1,i,j,patch;
  algorithm
    manifold:=zeros(6,7);patch:=1;
    if abs(pos[1]-36)>31 or abs(pos[2]-40)>26 then return;end if;
    reach:=sqrt(2.52^2+(abs(spacing)+.185)^2+.37^2);
    height:=pos[3]-abs(rotation[3,:])*{2.52,abs(spacing)+.185,.37};
    if height>sandHeightUpperBound(pos[1],pos[2],reach) then return;end if;
    ch:=cos(heading);sh:=sin(heading);
    bodyToWorld:=[ch,-sh,0;sh,ch,0;0,0,1]*rotation;
    center:=pos-{36,40,0};
    world:=zeros(96,3);tri:=zeros(3,3);lowest:=zeros(3);highest:=zeros(3);
    cell:=zeros(3,2);support:=zeros(4);deepest:=zeros(4);deepNormal:={0,0,1};up:={0,0,1};
    x:=0;y:=0;z0:=0;zE:=0;zN:=0;zEN:=0;offset:=0;length:=1;deepOffset:=0;
    i0:=0;i1:=0;j0:=0;j1:=0;i:=0;j:=0;
    for hull in 1:2 loop
      for j in 1:96 loop
        world[j,:]:=center+bodyToWorld*(vertices[j,:]+{0,(3-2*hull)*spacing,0});
      end for;
      deepest:=zeros(4);deepNormal:={0,0,1};deepOffset:=0;
      for face in 1:188 loop
        tri:={world[faces[face,j],:] for j in 1:3};
        lowest:={min(tri[:,j]) for j in 1:3};highest:={max(tri[:,j]) for j in 1:3};
        if lowest[3]<=sandHeightUpperBound(36+(lowest[1]+highest[1])/2,40+(lowest[2]+highest[2])/2,
          max(highest[1]-lowest[1],highest[2]-lowest[2])/2) then
          i0:=integer(floor((lowest[1]+29)/dx));i1:=integer(floor((highest[1]+29)/dx));
          j0:=integer(floor((lowest[2]+23)/dy));j1:=integer(floor((highest[2]+23)/dy));
          // A face on the 5.04 m pontoon fits within twelve cells on either axis.
          for column in 0:11 loop
            i:=i0+column;
            if i>i1 then break;end if;
            x:=-29+i*dx;
            for row in 0:11 loop
              j:=j0+row;
              if j>j1 then break;end if;
              y:=-23+j*dy;
              z0:=terrain(x,y);zE:=terrain(x+dx,y);zN:=terrain(x,y+dy);zEN:=terrain(x+dx,y+dy);
              if lowest[3]<=max({z0,zE,zN,zEN}) then
                for half in 1:2 loop
                  if half==1 then
                    up:={-(zE-z0)/dx,-(zN-z0)/dy,1};offset:=up*{x,y,z0};
                    cell:=[x,y;x+dx,y;x,y+dy];
                  else
                    up:={-(zEN-zN)/dx,-(zEN-zE)/dy,1};offset:=up*{x+dx,y+dy,zEN};
                    cell:=[x+dx,y+dy;x,y+dy;x+dx,y];
                  end if;
                  length:=sqrt(up*up);up:=up/length;offset:=offset/length;
                  support:=sandTriangleWitness(tri,cell,up,offset);
                  if support[1]>deepest[1] then deepest:=support;deepNormal:=up;deepOffset:=offset;end if;
                end for;
              end if;
            end for;
          end for;
        end if;
        // Faces are ordered along the pontoon, with two triangles per ring panel.
        if face==32 or face==80 or face==188 then
          if deepest[1]>0 then
            manifold[patch,:]:=cat(1,transpose(bodyToWorld)*(deepest[2:4]-center),deepNormal,{deepOffset+deepNormal*{36,40,0}});
          end if;
          deepest:=zeros(4);patch:=patch+1;
        end if;
      end for;
    end for;
    annotation(Inline=false);
  end hobieSandManifold;

  function sandManifoldWrench "Evaluate the contact gap and velocity continuously on the active manifold"
    input Real pos[3],heading,rotation[3,3],velocity[3],spin[3],manifold[6,7];
    output Real wrench[6] "Force and moment in level heading axes";
  protected
    constant Real stiffness[3]={85000,130000,70000};
    Real worldToLevel[3,3],ch,sh;
    Real arm[3],normal[3],worldNormal[3],gap,force[3];
    Collision.ContactPoint point;
    Collision.Material material;
  algorithm
    wrench:=zeros(6);
    if max(manifold[:,6])<=0 then return;end if;
    ch:=cos(heading);sh:=sin(heading);
    worldToLevel:=[ch,sh,0;-sh,ch,0;0,0,1];
    for i in 1:6 loop
      if manifold[i,6]>0 then
        arm:=rotation*manifold[i,1:3];worldNormal:=manifold[i,4:6];
        normal:=worldToLevel*worldNormal;
        gap:=worldNormal*pos+normal*arm-manifold[i,7];
        if gap<0 then
          material:=Collision.Material(stiffness[mod(i-1,3)+1],1,.48,1e-6,.08);
          point:=Collision.ContactPoint(gap,normal,arm,arm-gap*normal);
          force:=Collision.contactForce(point,velocity+cross(spin,arm),material);
          wrench[1:3]:=wrench[1:3]+force;wrench[4:6]:=wrench[4:6]+cross(arm,force);
        end if;
      end if;
    end for;
    annotation(Inline=false);
  end sandManifoldWrench;

  function contact
    input Real pos[3],heading,rotation[3,3],velocity[3],spin[3],xs[7],widths[7],spacing;
    input Boolean pointRocks=true "Use point boulder contacts for hulls without a face mesh";
    output Real wrench[6] "Force and moment in the level heading frame";
  algorithm
    if abs(pos[1]-36)>31 or abs(pos[2]-40)>26 then
      wrench:=zeros(6);
    else
      wrench:=islandContact(pos,heading,rotation,velocity,spin,xs,widths,spacing,rocks,planes,pointRocks);
    end if;
  end contact;
  function islandContact "Sand and boulder contact within the island bounds"
    input Real pos[3],heading,rotation[3,3],velocity[3],spin[3],xs[7],widths[7],spacing;
    input Real boulders[46,13],facets[80,4];
    input Boolean pointRocks=true;
    output Real wrench[6] "Force and moment in the level heading frame";
  protected
    Real arm[3],p[3],normal[3],delta[3],n[3],force[3],localPoint[3];
    Real x,y,h,t,z,dx,dy,penetration,d,along,beam,depth,highest,length;
    Collision.ContactPoint point;
    Collision.Material sand(k=if spacing>0 then 15000 else 9750,d=1,mu=.48,eps=1e-6,v_eps=.08);
    Integer nearby[46],count,r,f;
    Real reach,maxBeam,halfLength,halfWidth,halfHeight,lowest;
    Real ch,sh,profile[3],inv[3,3],q[3],gradient[3],magnitude;
  algorithm
    wrench:=zeros(6);
    ch:=cos(heading);sh:=sin(heading);
    // A rotation preserves distance from the hull origin. Screen rocks
    // once for the whole vessel before testing the unchanged hull samples.
    maxBeam:=max(abs(widths));
    halfLength:=max(abs(xs));
    halfWidth:=abs(spacing)+.69*max(maxBeam,max(pontoon[:,2]));
    halfHeight:=max(max(abs(pontoon[:,3:4])),.19*(.48+1.55*maxBeam));
    reach:=sqrt(halfLength^2+halfWidth^2+halfHeight^2);
    lowest:=pos[3]-abs(rotation[3,:])*{halfLength,halfWidth,halfHeight};
    nearby:=fill(0,46);count:=0;
    if pointRocks then
      for rock in 1:46 loop
        delta:=pos-boulders[rock,1:3];
        if delta*delta<(reach+boulders[rock,4])^2 then
          count:=count+1;
          nearby[count]:=rock;
        end if;
      end for;
    end if;
    if count==0 and lowest>sandHeightUpperBound(pos[1],pos[2],reach)+1e-8 then return;end if;
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
          if count>0 or p[3]<=sandHeightUpperBound(p[1],p[2],0)+1e-8 then
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
            length:=sqrt(normal*normal);
            penetration:=(z-p[3])/length;normal:=normal/length;
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
              point:=Collision.ContactPoint(-penetration,n,arm,arm+penetration*n);
              force:=Collision.contactForce(point,velocity+cross(spin,arm),sand);
              wrench[1:3]:=wrench[1:3]+force;wrench[4:6]:=wrench[4:6]+cross(arm,force);
            end if;
          end if;
        end for;
      end for;
    end for;
  end islandContact;
end Shore;
