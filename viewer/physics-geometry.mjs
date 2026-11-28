export const surfaceGridColor='#d8faff';

// Iterate adjacent nodes in the same order in the diagnostic views.
export function forEachGridEdge(columns,rows,edge,diagonals=false){
  for(let row=0;row<rows;row++)for(let column=0;column<columns;column++){
    const i=row*columns+column;
    if(column+1<columns)edge(i,i+1,row);
    if(row+1<rows){
      edge(i,i+columns,column);
      if(diagonals&&column+1<columns)edge(i,i+columns+1,-1);
    }
  }
}

export function forEachHullSectionEdge(stations,fractions,section,offset,edge){
  const i=6*section,x=stations[i],beam=stations[i+1];
  for(const side of [-1,1])for(let level=0;level<3;level++){
    edge(x,offset+side*beam*fractions[level],stations[i+2+level],
      offset+side*beam*fractions[level+1],stations[i+3+level]);
  }
  edge(x,offset-beam,stations[i+5],offset+beam,stations[i+5]);
}
