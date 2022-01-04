export function sum(...numbers:number[])
{
    let sum=0;
    for(const n of numbers){
        sum+=n;
    }
    return sum;
}

export function add(a:number,b:number){
    return a+b;
}