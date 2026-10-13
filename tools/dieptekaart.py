# Dieptekaart per coverfoto met een open dieptemodel (Depth Anything V2 Small).
import sys, os, numpy as np
from PIL import Image
from transformers import pipeline
SRC=sys.argv[1]; OUT=sys.argv[2]; os.makedirs(OUT,exist_ok=True)
covers={"vmbo-trias":"06","rwzi-heinenoord":"02","vve-dedemsvaartweg-den-haag":"01","obs-de-vogelenzang":"07","monumentaal-gebouw-schiedam":"04","diverse-kruipluiken":"05","leidingsleuven":"02"}
pipe=pipeline("depth-estimation", model="depth-anything/Depth-Anything-V2-Small-hf")
for pid,nr in covers.items():
    im=Image.open(f"{SRC}/{pid}/{nr}.jpg").convert("RGB")
    d=np.array(pipe(im)["depth"]).astype("float32")      # hoog = dichtbij
    d=(d-d.min())/(d.max()-d.min()+1e-6)
    Image.fromarray((d*255).astype("uint8")).resize(im.size,Image.BICUBIC).save(f"{OUT}/{pid}-diepte.png")
    print(pid, im.size, "diepte ok")
