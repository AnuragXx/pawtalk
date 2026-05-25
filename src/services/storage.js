/**
 * Firebase Storage service for PawTalk.
 * Uploads pet photos to Firebase Storage and returns download URLs.
 * Photos are stored at: pets/{userId}/{petId}/photo.jpg
 */
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { storage } from '../config/firebase';

/**
 * Upload a pet photo to Firebase Storage.
 * @param {string} userId
 * @param {string} petId
 * @param {string} localUri - local file URI from ImagePicker
 * @param {function} onProgress - optional progress callback (0-100)
 * @returns {string} download URL
 */
export async function uploadPetPhoto(userId, petId, localUri, onProgress) {
  try {
    const response = await fetch(localUri);
    const blob = await response.blob();

    const storageRef = ref(storage, `pets/${userId}/${petId}/photo.jpg`);

    return new Promise((resolve, reject) => {
      const uploadTask = uploadBytesResumable(storageRef, blob, {
        contentType: 'image/jpeg',
      });

      uploadTask.on(
        'state_changed',
        (snapshot) => {
          const progress = Math.round(
            (snapshot.bytesTransferred / snapshot.totalBytes) * 100
          );
          if (onProgress) onProgress(progress);
        },
        (error) => {
          // Storage may not be enabled — resolve with null so caller falls back to local URI
          resolve(null);
        },
        async () => {
          try {
            const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
            resolve(downloadURL);
          } catch (_) {
            resolve(null);
          }
        }
      );
    });
  } catch (_) {
    return null;
  }
}

/**
 * Delete a pet photo from Firebase Storage.
 */
export async function deletePetPhoto(userId, petId) {
  try {
    const storageRef = ref(storage, `pets/${userId}/${petId}/photo.jpg`);
    await deleteObject(storageRef);
  } catch (_) {
    // File may not exist — ignore
  }
}
