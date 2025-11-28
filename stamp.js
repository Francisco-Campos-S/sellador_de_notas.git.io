// Lógica para cargar PDF, incrustar sello (imagen o texto) y descargar el resultado.
(function(){
  const { PDFDocument, StandardFonts, rgb } = PDFLib;

  // Elementos DOM mínimos: solo archivo, botón y status
  const pdfFileEl = document.getElementById('pdfFile');
  const stampBtn = document.getElementById('stampBtn');
  const statusEl = document.getElementById('status');
  const previewImg = document.getElementById('previewStamp');
  const previewMsg = document.getElementById('previewMsg');
  const previewFrame = document.getElementById('previewFrame');
  const pdfPreview = document.getElementById('pdfPreview');
  const downloadLink = document.getElementById('downloadLink');
  const clearBtn = document.getElementById('clearPreview');
  const printBtn = document.getElementById('printBtn');
  let currentPreviewUrl = null;
  let isProcessing = false;

  function setStatus(msg){ statusEl.textContent = msg; }

  // Cuando el usuario selecciona archivo, iniciar sellado automáticamente
  if(pdfFileEl){
    pdfFileEl.addEventListener('change', (e)=>{
      try{
        const f = e.target.files && e.target.files[0];
        if(f){
          setStatus(`Archivo seleccionado: ${f.name} — sellando automáticamente...`);
          // Llamada automática al proceso de sellado
          processSelectedFile(f).catch(err=>console.error('Error en sellado automático', err));
        } else {
          setStatus('Ningún archivo seleccionado');
        }
      }catch(err){ console.error('Error en change handler del input file', err); }
    });
  }

  // Acción de imprimir: si hay vista previa, imprimir desde el iframe
  if(printBtn){
    printBtn.addEventListener('click', ()=>{
      try{
        if(previewFrame && previewFrame.src){
          try{
            previewFrame.contentWindow.focus();
            previewFrame.contentWindow.print();
            setStatus('Enviando a imprimir...');
          }catch(err){
            console.warn('No se pudo imprimir desde iframe, abriendo en nueva pestaña', err);
            window.open(previewFrame.src, '_blank');
            setStatus('Se abrió el PDF en otra pestaña para impresión.');
          }
        } else {
          setStatus('No hay PDF para imprimir. Primero haz "Sellar".');
        }
      }catch(e){ console.error('Error en print handler', e); setStatus('Error al intentar imprimir.'); }
    });
  }

  // Botón Limpiar: limpia input, revoca preview y oculta elementos relacionados
  if(clearBtn){
    clearBtn.addEventListener('click', ()=>{
      try{
        // Limpiar input de archivo
        if(pdfFileEl){ pdfFileEl.value = ''; }
        // Quitar preview
        if(previewFrame){ previewFrame.src = ''; }
        if(pdfPreview){ pdfPreview.style.display = 'none'; }
        // Ocultar enlace de descarga
        if(downloadLink){ downloadLink.href = '#'; downloadLink.style.display = 'none'; }
        // Revocar URL si existe
        if(currentPreviewUrl){ try{ URL.revokeObjectURL(currentPreviewUrl); }catch(e){ console.warn('No se pudo revocar URL', e); } currentPreviewUrl = null; }
        // Limpiar estado
        setStatus('');
        if(pdfFileEl){ pdfFileEl.focus(); }
      }catch(err){ console.error('Error limpiando vista/preview', err); }
    });
  }

  async function readFileAsArrayBuffer(file){
    return await new Promise((res, rej)=>{
      const fr = new FileReader();
      fr.onload = () => res(fr.result);
      fr.onerror = rej;
      fr.readAsArrayBuffer(file);
    });
  }
  // Procesa un archivo PDF ya seleccionado: aplica sello/firma y muestra vista previa
  async function processSelectedFile(pdfFile){
    if(!pdfFile) { setStatus('No hay archivo para procesar'); return; }
    if(isProcessing){ setStatus('Procesamiento en curso, espera...'); return; }
    isProcessing = true;
    try{
      setStatus('Preparando...');
      const pdfBytes = await readFileAsArrayBuffer(pdfFile);
      console.log('PDF leído en bytes, tamaño:', pdfBytes && pdfBytes.byteLength);
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
      // Desplazamiento vertical para la firma: subir 1 cm desde la posición calculada
      const signatureUpShiftCm = 1; // centímetros
      const signatureUpShift = Math.round(signatureUpShiftCm * 72 / 2.54); // convertir cm -> puntos
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

      // Cargar imagen de firma de director(a) si existe (firmadirector.png)
      let firmImageEmbedded = null;
      try{
        setStatus('Buscando firma de director(a): firmadirector.png');
        const respF = await fetch('./firmadirector.png');
        if(respF && respF.ok){
          const arrF = await respF.arrayBuffer();
          try{ firmImageEmbedded = await pdfDoc.embedPng(arrF); console.log('firmadirector.png embebido como PNG'); }
          catch(e){ console.warn('No se pudo embeber firmadirector.png como PNG', e); firmImageEmbedded = null; }
        } else {
          console.debug('firmadirector.png no disponible via fetch');
        }
      }catch(err){ console.debug('Error comprobando firmadirector.png', err); }

      // Si no se embebió vía fetch, intentar como <img> fallback
      if(!firmImageEmbedded){
        try{
          const imgF = document.createElement('img');
          imgF.src = './firmadirector.png';
          await new Promise((res, rej)=>{ imgF.onload = res; imgF.onerror = rej; });
          const canvasF = document.createElement('canvas');
          canvasF.width = imgF.naturalWidth || 800;
          canvasF.height = imgF.naturalHeight || 400;
          const ctxF = canvasF.getContext('2d');
          ctxF.clearRect(0,0,canvasF.width,canvasF.height);
          ctxF.drawImage(imgF,0,0);
          const dataURLF = canvasF.toDataURL('image/png');
          const bytesF = dataURLToUint8Array(dataURLF);
          firmImageEmbedded = await pdfDoc.embedPng(bytesF);
          console.log('Embebido firma via canvas fallback');
        }catch(err){ console.debug('No se pudo cargar firmadirector.png via img fallback', err); firmImageEmbedded = null; }
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
          // Si hay imagen de firma, dibujarla a la izquierda del sello (ajustando separación)
          if(firmImageEmbedded){
            try{
              // Colocar la firma centrada en la columna "Nombre y firma de director(a)".
              // Ajustable: fraction del ancho donde se centra la columna (0..1)
              // Aumentado para la columna correcta; use `signatureColumnOffsetPx` para afinaciones finas
              const signatureColumnFraction = 0.72; // ajustar si hace falta (ej. 0.70-0.78)
              // Mover la firma 1 cm a la izquierda: convertir cm a puntos (pt) y usar negativo
              const signatureColumnOffsetPx = -Math.round(1 * 72 / 2.54); // -1 cm en puntos (~ -28)
              const sigFraction = 0.18; // fracción del ancho para la firma
              const maxSigPx = 220;
              let drawWidthSig = Math.min(maxSigPx, Math.floor(width * sigFraction));
              const sigImgW = firmImageEmbedded.width;
              const sigImgH = firmImageEmbedded.height;
              let scaleSig = drawWidthSig / sigImgW;
              let drawHeightSig = sigImgH * scaleSig;
              // Centro de la columna donde colocar la firma
              let colCenterX = Math.floor(width * signatureColumnFraction) + signatureColumnOffsetPx;
              let xSig = colCenterX - Math.floor(drawWidthSig/2);
              if(xSig < 8) xSig = 8;
              if(xSig + drawWidthSig > width - 8) xSig = Math.max(8, width - 8 - drawWidthSig);
              // Alineamos verticalmente con el sello (misma y)
              // Subir la firma `signatureUpShift` puntos (1 cm) respecto a la posición base `y`
              let ySig = y + signatureUpShift;
              // Evitar que la firma sobresalga por arriba/abajo
              if(ySig + drawHeightSig > height - 8){ ySig = Math.max(8, height - 8 - drawHeightSig); }
              console.log('Posición firma (col) x=', xSig, 'y=', ySig, 'w=', drawWidthSig, 'h=', drawHeightSig, 'colCenter=', colCenterX);
              page.drawImage(firmImageEmbedded, { x: xSig, y: ySig, width: drawWidthSig, height: drawHeightSig });
            }catch(e){ console.warn('Error dibujando firma de director(a)', e); }
          }

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
          // Si tenemos firma, dibujarla también cuando no exista sello principal
          if(firmImageEmbedded){
            try{
              const sigFraction = 0.18; const maxSigPx = 220;
              let drawWidthSig = Math.min(maxSigPx, Math.floor(width * sigFraction));
              const sigImgW = firmImageEmbedded.width;
              const sigImgH = firmImageEmbedded.height;
              let scaleSig = drawWidthSig / sigImgW;
              let drawHeightSig = sigImgH * scaleSig;
              // colocarla a la izquierda cerca de la esquina derecha
              let xSig = width - drawWidthSig - defaultMarginRight - extraLeftShift - 12;
              if(xSig < 8) xSig = 8;
              // Mismo ajuste vertical para el fallback de texto: subir 1 cm
              let ySig = ty + signatureUpShift;
              page.drawImage(firmImageEmbedded, { x: xSig, y: ySig, width: drawWidthSig, height: drawHeightSig });
            }catch(e){ console.warn('Error dibujando firma en fallback de texto', e); }
          }
          page.drawText(stampText, { x: tx, y: ty, size: fontSize, font, color: rgb(0,0,0) });
        }
      }

      // status message suppressed per user request
      const newPdfBytes = await pdfDoc.save();
      // Descargar
      const blob = new Blob([newPdfBytes], { type: 'application/pdf' });
      // Revocar preview anterior si existe
      if(currentPreviewUrl){ try{ URL.revokeObjectURL(currentPreviewUrl); }catch(e){} currentPreviewUrl = null; }
      const url = URL.createObjectURL(blob);
      currentPreviewUrl = url;
      const baseName = pdfFile.name.replace(/\.pdf$/i,'') || 'sellado';

      // Mostrar vista previa en la página (iframe)
      const previewFrame = document.getElementById('previewFrame');
      const pdfPreview = document.getElementById('pdfPreview');
      const downloadLink = document.getElementById('downloadLink');
      if(previewFrame && pdfPreview){
        try{
          previewFrame.src = url;
          downloadLink.href = url;
          downloadLink.download = baseName + '_sellado.pdf';
          downloadLink.style.display = 'inline-block';
          pdfPreview.style.display = 'block';

          console.log('Preview URL asignada al iframe:', url);

          // No hay botón "Cerrar vista"; dejamos la vista previa abierta.
        }catch(err){
          console.error('Error mostrando preview en iframe:', err);
          // Fallback: abrir en nueva pestaña
          try{ window.open(url, '_blank'); setStatus('Preview abierto en nueva pestaña.'); }
          catch(e){ setStatus('PDF generado pero no se pudo mostrar en la página.'); }
        }
      } else {
        // Si no hay contenedor de vista previa, revocar la URL (evitar leaks)
        try{ URL.revokeObjectURL(url); }catch(e){}
        setStatus('Listo — PDF descargado.');
      }
    }catch(err){
      console.error(err);
      setStatus('Error: ' + (err.message||String(err)));
    } finally {
      isProcessing = false;
    }
  }

  // Si el botón de sellar existe (compatibilidad), mantener su comportamiento llamando a la función central
  if(stampBtn){
    stampBtn.addEventListener('click', async ()=>{
      const pdfFile = pdfFileEl && pdfFileEl.files && pdfFileEl.files[0];
      if(!pdfFile){ setStatus('Selecciona un PDF primero.'); return; }
      await processSelectedFile(pdfFile);
    });
  }
})();
