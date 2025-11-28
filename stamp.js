// Lógica para cargar PDF, incrustar sello (imagen o texto) y descargar el resultado.
(function(){
  const { PDFDocument, StandardFonts, rgb } = PDFLib;

  // Elementos DOM mínimos: solo archivo, botón y status
  const pdfFileEl = document.getElementById('pdfFile');
  const stampBtn = document.getElementById('stampBtn');
  const statusEl = document.getElementById('status');
  const previewImg = document.getElementById('previewStamp');
  const previewMsg = document.getElementById('previewMsg');

  function setStatus(msg){ statusEl.textContent = msg; }

  async function readFileAsArrayBuffer(file){
    return await new Promise((res, rej)=>{
      const fr = new FileReader();
      fr.onload = () => res(fr.result);
      fr.onerror = rej;
      fr.readAsArrayBuffer(file);
    });
  }

  stampBtn.addEventListener('click', async ()=>{
    try{
      setStatus('Preparando...');
      const pdfFile = pdfFileEl.files[0];
      if(!pdfFile){ setStatus('Selecciona un PDF primero.'); return; }

      const pdfBytes = await readFileAsArrayBuffer(pdfFile);
      const pdfDoc = await PDFDocument.load(pdfBytes);
      // Opciones por defecto: usar sello incluido `SELLO.jpeg`, aplicar a la última página,
      // tamaño relativo y márgenes fijos.
      // Ajustes para visibilidad del sello
      // Aplicar a TODAS las páginas por defecto y colocar el sello en la mitad derecha
      // con un tamaño menor (para no tapar contenido) y posición vertical relativa.
      // Ajustes para colocar el sello en la esquina inferior derecha (debajo del encabezado "Sello del centro educativo")
      const defaultMarginRight = 24; // distancia desde el borde derecho
      const defaultMarginBottom = 36; // distancia desde el borde inferior (evita el número de página)
      // Ajuste adicional vertical: desplazamiento para bajar (hacia el borde inferior) el sello
      // El usuario pidió '0.2 cm' — convertimos centímetros a puntos PDF (1 in = 72 pt, 1 in = 2.54 cm)
      const extraDownShiftCm = 0.2; // centímetros
      const extraDownShift = Math.round(extraDownShiftCm * 72 / 2.54); // convertir cm -> puntos (aprox 5.67 => 6)
      // Desplazamiento horizontal adicional: mover el sello hacia la IZQUIERDA 0.5 cm
      const extraLeftShiftCm = 0.5; // centímetros
      const extraLeftShift = Math.round(extraLeftShiftCm * 72 / 2.54); // convertir cm -> puntos
      const sizeFraction = 0.13; // 13% del ancho de la página por defecto (tamaño reducido)
      const maxSizePx = 320;

      // Cargar sello por defecto (debe existir en la raíz del repo)
      let stampImageEmbedded = null;
      // Helper: convertir dataURL a Uint8Array
      function dataURLToUint8Array(dataURL){
        const base64 = dataURL.split(',')[1];
        const binary = atob(base64);
        const len = binary.length;
        const bytes = new Uint8Array(len);
        for(let i=0;i<len;i++) bytes[i] = binary.charCodeAt(i);
        return bytes;
      }

      // Probar varias variantes de nombre de archivo del sello en la raíz
      // Priorizar `SELLO2.png` si existe (solicitud del usuario)
      const candidates = [
        'SELLO2.png','SELLO2.PNG',
        'SELLO.JPG','SELLO.jpg','SELLO.JPEG','SELLO.jpeg','SELLO.PNG','SELLO.png',
        'sello.jpg','sello.jpeg','sello.png'
      ];
      let foundName = null;
      for(const name of candidates){
        try{
          setStatus(`Buscando sello: ${name}`);
          if(previewImg){ previewImg.style.display = 'none'; previewMsg.textContent = 'Intentando cargar sello...'; }
          const resp = await fetch('./' + name);
          if(!resp.ok) { console.debug(name, 'no disponible'); continue; }
          const arr = await resp.arrayBuffer();
          // Intentar embebido como JPG, luego PNG
          try{ stampImageEmbedded = await pdfDoc.embedJpg(arr); console.log(name, 'embebido como JPG'); }
          catch(e1){
            try{ stampImageEmbedded = await pdfDoc.embedPng(arr); console.log(name, 'embebido como PNG'); }
            catch(e2){ console.warn('No se pudo embeber', name, e2); stampImageEmbedded = null; }
          }
          if(stampImageEmbedded){ foundName = name; break; }
        }catch(err){ console.debug('Error comprobando', name, err); }
      }

      // Si no lo encontramos vía fetch/embebido directo, intentar cargar como <img> usando el primer candidato que exista
      if(!stampImageEmbedded){
        for(const name of candidates){
          try{
            setStatus(`Intentando cargar imagen (img) ${name}`);
            const img = document.createElement('img');
            img.src = './' + name;
            if(previewImg){ previewMsg.textContent = 'Cargando sello (fallback)...'; }
            await new Promise((res, rej)=>{ img.onload = res; img.onerror = rej; });
            if(previewImg){ previewImg.src = './' + name; previewImg.style.display = 'inline-block'; previewMsg.textContent = `Sello cargado: ${name}`; }
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth || 1000;
            canvas.height = img.naturalHeight || 1000;
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0,0,canvas.width,canvas.height);
            ctx.drawImage(img,0,0);
            const dataURL = canvas.toDataURL('image/png');
            const bytes = dataURLToUint8Array(dataURL);
            stampImageEmbedded = await pdfDoc.embedPng(bytes);
            foundName = name;
            console.log('Embebido via canvas fallback desde', name);
            break;
          }catch(err){ console.debug('No se pudo cargar imagen', name, err); }
        }
      }

      if(!stampImageEmbedded){
        setStatus('No se encontró SELLO.* en la raíz; se usará texto como reserva');
        if(previewMsg) previewMsg.textContent = 'SELLO.* no encontrado';
      } else {
        if(foundName && previewImg){ previewImg.src = './' + foundName; previewImg.style.display = 'inline-block'; previewMsg.textContent = `Sello OK: ${foundName}`; }
      }

      // Fuente para texto en fallback
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

      const pages = pdfDoc.getPages();
      // Aplicar sello a todas las páginas
      const targetPages = pages;
      console.log('Aplicando sello en todas las páginas, total:', pages.length);
      setStatus('Aplicando sello en todas las páginas...');

      for(const page of targetPages){
        const { width, height } = page.getSize();

        if(stampImageEmbedded){
          const imgWidth = stampImageEmbedded.width;
          const imgHeight = stampImageEmbedded.height;

          // Tamaño objetivo a partir de fracción del ancho de la página
          let drawWidth = Math.min(maxSizePx, Math.floor(width * sizeFraction));
          let scale = drawWidth / imgWidth;
          let drawHeight = imgHeight * scale;

          // Si la altura excede el espacio disponible, reescalamos
          const availableHeight = Math.max(8, height - defaultMarginBottom - 8);
          if(drawHeight > availableHeight){
            scale = availableHeight / imgHeight;
            drawHeight = imgHeight * scale;
            drawWidth = imgWidth * scale;
          }

          // Posición: colocamos el sello dentro de la mitad derecha de la página
          // (aprox debajo del encabezado "Sello del centro educativo") y centrado
          // en esa zona para no tapar el número de página en la esquina.
          // Colocar el sello en la esquina inferior derecha: margen fijo desde derecha e inferior
          let x = width - drawWidth - defaultMarginRight - extraLeftShift;
          if(x < 8) x = 8;
          // Bajar ligeramente el sello: restamos `extraDownShift` al margen inferior
          let y = Math.max(8, defaultMarginBottom - extraDownShift);
          console.log('Posición sello (corner) x=', x, 'y=', y, 'drawWidth=', drawWidth, 'drawHeight=', drawHeight);
          page.drawImage(stampImageEmbedded, { x, y, width: drawWidth, height: drawHeight });
        } else {
          // Fallback a texto simple si no hay imagen
          const stampText = '9-2';
          const desiredWidth = Math.min(maxSizePx, Math.floor(width * sizeFraction));
          const approx100 = font.widthOfTextAtSize(stampText, 100) || 1;
          const fontSize = Math.max(8, Math.floor(desiredWidth * 100 / approx100));
          const textWidth = font.widthOfTextAtSize(stampText, fontSize);
          let tx = width - textWidth - defaultMarginRight - extraLeftShift;
          let ty = Math.max(8, defaultMarginBottom - extraDownShift);
          if(tx < 8) tx = 8;
          page.drawText(stampText, { x: tx, y: ty, size: fontSize, font, color: rgb(0,0,0) });
        }
      }

      setStatus('Generando PDF...');
      const newPdfBytes = await pdfDoc.save();
      // Descargar
      const blob = new Blob([newPdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const baseName = pdfFile.name.replace(/\.pdf$/i,'') || 'sellado';
      a.download = baseName + '_sellado.pdf';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setStatus('Listo — PDF descargado.');
    }catch(err){
      console.error(err);
      setStatus('Error: ' + (err.message||String(err)));
    }
  });
})();
