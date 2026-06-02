"""Push the built index + images + source PDFs to S3 so the query Lambda can load
them. Creates the buckets (private, all public access blocked) if absent. Object
keys match the `s3_key` stored in metadata.json so fetch_image can sign them
directly; source PDFs go to `pdfs/{slug}.pdf` to match the /pdf-url handler.
Run: ingest/.venv/bin/python ingest/upload.py
"""
import mimetypes
import boto3
from botocore.exceptions import ClientError
from config import OUT_DIR, IMAGES_DIR, IMAGES_BUCKET, VECTORS_BUCKET, SAMPLE_DIR
from extract import slug

REGION = "ap-south-1"
s3 = boto3.client("s3", region_name=REGION)


def ensure_bucket(name: str):
    try:
        s3.head_bucket(Bucket=name)
        return
    except ClientError:
        pass
    s3.create_bucket(Bucket=name,
                     CreateBucketConfiguration={"LocationConstraint": REGION})
    s3.put_public_access_block(Bucket=name, PublicAccessBlockConfiguration={
        "BlockPublicAcls": True, "IgnorePublicAcls": True,
        "BlockPublicPolicy": True, "RestrictPublicBuckets": True})
    print("created bucket", name)


def _put(bucket: str, key: str, path):
    ctype = mimetypes.guess_type(str(path))[0] or "application/octet-stream"
    s3.upload_file(str(path), bucket, key, ExtraArgs={"ContentType": ctype})


def main():
    ensure_bucket(VECTORS_BUCKET)
    ensure_bucket(IMAGES_BUCKET)

    for name in ("index.faiss", "vectors.f32", "metadata.json", "manifest.json"):
        _put(VECTORS_BUCKET, name, OUT_DIR / name)
        print(f"  s3://{VECTORS_BUCKET}/{name}")

    n = 0
    for png in IMAGES_DIR.rglob("*.png"):
        key = "images/" + png.relative_to(IMAGES_DIR).as_posix()  # == metadata s3_key
        _put(IMAGES_BUCKET, key, png)
        n += 1
    print(f"uploaded {n} images -> s3://{IMAGES_BUCKET}/images/")

    # Source PDFs -> pdfs/{slug}.pdf. The slug must match extract.slug(pdf.stem)
    # (the doc_id) so the /pdf-url handler signs the right key when the UI opens
    # a manual at a page. Without this the "Open PDF" button 404s on new docs.
    p = 0
    for pdf in sorted(SAMPLE_DIR.glob("*.pdf")):
        key = f"pdfs/{slug(pdf.stem)}.pdf"
        _put(IMAGES_BUCKET, key, pdf)
        print(f"  s3://{IMAGES_BUCKET}/{key}")
        p += 1
    print(f"uploaded {p} source PDFs -> s3://{IMAGES_BUCKET}/pdfs/")


if __name__ == "__main__":
    main()
