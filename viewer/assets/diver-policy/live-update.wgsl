fn rumoca_real_min(a: f32, b: f32) -> f32 { return select(select(b, a, ((b != b) || (a < b))), (a + b), ((a != a) && (b != b))); }
fn rumoca_real_max(a: f32, b: f32) -> f32 { return select(select(b, a, ((b != b) || (a > b))), (a + b), ((a != a) && (b != b))); }

fn rumoca_evaluate(p: array<f32, 80>, time: f32) -> array<f32, 20> {
    var y: array<f32, 20>;
    {
        var next: array<f32, 1>;
        next[0u] = ((p[53]) - (p[59]));
        for (var i = 0u; i < 1u; i++) {
            y[5u + i] = next[i];
        }
    }
    {
        var next: array<f32, 1>;
        next[0u] = ((p[65]) - (p[71]));
        for (var i = 0u; i < 1u; i++) {
            y[11u + i] = next[i];
        }
    }
    {
        var next: array<f32, 1>;
        next[0u] = ((((p[52]) - (p[58]))) + (((0.94) * (y[5]))));
        for (var i = 0u; i < 1u; i++) {
            y[4u + i] = next[i];
        }
    }
    {
        var next: array<f32, 1>;
        next[0u] = ((((p[51]) - (p[57]))) + (((0.94) * (y[4]))));
        for (var i = 0u; i < 1u; i++) {
            y[3u + i] = next[i];
        }
    }
    {
        var next: array<f32, 1>;
        next[0u] = ((((p[50]) - (p[56]))) + (((0.94) * (y[3]))));
        for (var i = 0u; i < 1u; i++) {
            y[2u + i] = next[i];
        }
    }
    {
        var next: array<f32, 1>;
        next[0u] = ((((p[49]) - (p[55]))) + (((0.94) * (y[2]))));
        for (var i = 0u; i < 1u; i++) {
            y[1u + i] = next[i];
        }
    }
    {
        var next: array<f32, 1>;
        next[0u] = ((((p[48]) - (p[54]))) + (((0.94) * (y[1]))));
        for (var i = 0u; i < 1u; i++) {
            y[0u + i] = next[i];
        }
    }
    {
        var next: array<f32, 1>;
        next[0u] = ((((p[64]) - (p[70]))) + (((0.94) * (y[11]))));
        for (var i = 0u; i < 1u; i++) {
            y[10u + i] = next[i];
        }
    }
    {
        var next: array<f32, 1>;
        next[0u] = ((((p[63]) - (p[69]))) + (((0.94) * (y[10]))));
        for (var i = 0u; i < 1u; i++) {
            y[9u + i] = next[i];
        }
    }
    {
        var next: array<f32, 1>;
        next[0u] = ((((p[62]) - (p[68]))) + (((0.94) * (y[9]))));
        for (var i = 0u; i < 1u; i++) {
            y[8u + i] = next[i];
        }
    }
    {
        var next: array<f32, 1>;
        next[0u] = ((((p[61]) - (p[67]))) + (((0.94) * (y[8]))));
        for (var i = 0u; i < 1u; i++) {
            y[7u + i] = next[i];
        }
    }
    {
        var next: array<f32, 1>;
        next[0u] = ((((p[60]) - (p[66]))) + (((0.94) * (y[7]))));
        for (var i = 0u; i < 1u; i++) {
            y[6u + i] = next[i];
        }
    }
    {
        var next: array<f32, 1>;
        next[0u] = ((p[78]) + (((((((((((((((((((((((((((y[0]) * (((((p[24]) * (p[0]))) - (((p[30]) * (p[6]))))))) + (((y[6]) * (((((p[36]) * (p[12]))) - (((p[42]) * (p[18]))))))))) + (((y[1]) * (((((p[25]) * (p[1]))) - (((p[31]) * (p[7]))))))))) + (((y[7]) * (((((p[37]) * (p[13]))) - (((p[43]) * (p[19]))))))))) + (((y[2]) * (((((p[26]) * (p[2]))) - (((p[32]) * (p[8]))))))))) + (((y[8]) * (((((p[38]) * (p[14]))) - (((p[44]) * (p[20]))))))))) + (((y[3]) * (((((p[27]) * (p[3]))) - (((p[33]) * (p[9]))))))))) + (((y[9]) * (((((p[39]) * (p[15]))) - (((p[45]) * (p[21]))))))))) + (((y[4]) * (((((p[28]) * (p[4]))) - (((p[34]) * (p[10]))))))))) + (((y[10]) * (((((p[40]) * (p[16]))) - (((p[46]) * (p[22]))))))))) + (((y[5]) * (((((p[29]) * (p[5]))) - (((p[35]) * (p[11]))))))))) + (((y[11]) * (((((p[41]) * (p[17]))) - (((p[47]) * (p[23]))))))))) / (((((24.0) * (p[76]))) * (p[79]))))));
        for (var i = 0u; i < 1u; i++) {
            y[12u + i] = next[i];
        }
    }
    {
        var next: array<f32, 1>;
        next[0u] = ((((0.9) * (p[73]))) + (((0.1) * (y[12]))));
        for (var i = 0u; i < 1u; i++) {
            y[13u + i] = next[i];
        }
    }
    {
        var next: array<f32, 1>;
        next[0u] = ((((0.99) * (p[74]))) + (((0.01) * (((y[12]) * (y[12]))))));
        for (var i = 0u; i < 1u; i++) {
            y[14u + i] = next[i];
        }
    }
    {
        var next: array<f32, 1>;
        next[0u] = ((p[72]) + (((((p[77]) * (((y[13]) / (((1.0) - (pow(0.9, ((p[75]) + (1.0)))))))))) / (((sqrt(((y[14]) / (((1.0) - (pow(0.99, ((p[75]) + (1.0))))))))) + (1e-7))))));
        for (var i = 0u; i < 1u; i++) {
            y[15u + i] = next[i];
        }
    }
    {
        var next: array<f32, 1>;
        next[0u] = y[15];
        for (var i = 0u; i < 1u; i++) {
            y[16u + i] = next[i];
        }
    }
    {
        var next: array<f32, 1>;
        next[0u] = y[13];
        for (var i = 0u; i < 1u; i++) {
            y[17u + i] = next[i];
        }
    }
    {
        var next: array<f32, 1>;
        next[0u] = y[14];
        for (var i = 0u; i < 1u; i++) {
            y[18u + i] = next[i];
        }
    }
    {
        var next: array<f32, 1>;
        next[0u] = y[12];
        for (var i = 0u; i < 1u; i++) {
            y[19u + i] = next[i];
        }
    }
    return y;
}
