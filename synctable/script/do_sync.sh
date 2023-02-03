#!/bin/bash

# SPDX-License-Identifier: MIT

SYNCPATH="/opt/table"

if [ ! -d $SYNCPATH ]; then
    echo "$SYNCPATH doesn't exit, bailing"
    exit 1
fi

cd $SYNCPATH

# COUNTFILE has the format:
# "region": [ count, "last-modified string", last-modified epoch ]
#  (only quotes around region and the last-modified string)
COUNTFILE="$SYNCPATH/totalcount.json"
NEW_COUNTFILE="$SYNCPATH/totalcount.json.new"

PID_FILE="$SYNCPATH/.skript/do_sync.pid"
PID=$$

REGIONS_URL="http://127.0.0.1/mlat-map/mirror_regions.json"
REGIONS_FILE="${SYNCPATH}/data/mirror_regions.json"

HEADER_FILE="curl_headers.txt"

#
# This is called to safely update the "REGIONS" file
#
LAST_UPDATE=0
update_region_file () {
    local RFILE=$1
    local NOW=$( date +%s )
    # %Y = mtime in UNIX epoch
    local AGE=$(( NOW - LAST_UPDATE ))

    # echo "`date` :: Checking age..." 

    if [ $AGE -ge 120 ]; then
        # Set this back a little so we retry sooner.  This gets set to "NOW" when things are successful
        LAST_UPDATE=$(( NOW - 60 ))

        local RFILE_TMP="${RFILE}.curl"

        WG=$( curl -s --compressed $REGIONS_URL > $RFILE_TMP 2>&1 )

        RV=$?
        if [ $RV -ne 0 ]; then
            # Something failed, just return
            echo "`date` :: Mirror file refresh failed, keeping old file" 
            echo "OUTPUT = [ $WG ]" 
            return 0
        fi

        LAST_UPDATE=$NOW

        # Make sure the file is a sane size
        SZ=$( stat -c %s $RFILE_TMP 2>&1 )
        if [ $SZ -le 256 ]; then
            echo "`date` :: Mirror file seems too small ($SZ bytes), keeping old file" 
            return 0
        fi
        # Make sure it's a valid JSON file...
        JQ_TEST=$( jq empty $RFILE_TMP 2>&1 )
        JQRV=$?
        if [ $JQRV -ne 0 ]; then
            # Some sort of error.  Complain and bail
            echo "`date` :: ERROR: $RFILE_TMP did not properly parse as json"
            echo "`date` :: [ $JQ_TEST ]"
            return 0
        fi
        # See if the file changed
        DIFF=$( diff -u $RFILE $RFILE_TMP 2>&1 )
        DRV=$?
        if [ $DRV -eq 0 ]; then
            # Didn't change, just return
            # echo "`date` :: No Change [$DRV] [$DIFF]" 
            # Clean up...
            rm -f $RFILE_TMP
            return 0
        fi
        # At this point, we should just rotate out the file
        OFILE_TIME=$( date -r $RFILE +"%Y%m%d-%H%M" )
        OFILE="${RFILE}.${OFILE_TIME}"
        echo "`date` :: Mirror file changed, replacing..." 
        echo "DIFF:" 
        echo "$DIFF" 
        # Use 'cp' for the old file so we never have "no file" there. Then use 'mv' to clobber it
        cp $RFILE $OFILE
        mv $RFILE_TMP $RFILE
    fi
}


if [ ! -e $REGIONS_FILE ]; then
    echo "Missing region definition file - $REGIONS_FILE"
    echo "Attempting to download..."

    update_region_file $REGIONS_FILE

    if [ ! -e $REGIONS_FILE ]; then
        echo "Bad stuff going on, couldn't get file."
        exit 1
    fi
fi

SYNC="sync.json"
NEWSYNC="newsync.json"
NEWSYNC_gz="newsync.json.gz"

pp(){
    pp_region=$1
    pp_date=`date`
    echo -n "$pp_date"
    if [ "x$pp_region" == "x" ]; then
        return
    fi
    echo -n " :: Region $pp_region"
}


command -v jq > /dev/null 2>&1
HAVE_JQ=$?

# Turn this into 0 = no and 1 = yes
if [ $HAVE_JQ -eq 0 ]; then
    HAVE_JQ=1
else
    HAVE_JQ=0
fi

LAST_HOUR=`date +%H`

# Clobber/create
echo "{" > $NEW_COUNTFILE

START=`date +%s`

update_region_file $REGIONS_FILE

#REGIONS=`jq -r 'keys[] as $k | "\($k)"' $REGIONS_FILE`
#REGIONS=`jq -r 'keys_unsorted[] as $k | "\(.[$k].region)"' $REGIONS_FILE`
REGIONS=`jq -r 'keys_unsorted[] as $k | "\(.[$k].region) \(.[$k].enabled)"' $REGIONS_FILE | grep ' true' | sed -e 's/ true//g'`

for i in $REGIONS; do
    cd $SYNCPATH
    if [ ! -d $i ]; then
        echo "`pp $i` ** ERROR: $i doesn't exit, attempting to create" 
        mkdir $i 
        RV=$?
        if [ $RV -ne 0 ]; then
            echo "`pp $i` ** FATAL - unable to create directory for $i, skipping" 
            continue
        fi
        # Add the default links
        echo "`pp $i` ** Creating links..." 
        pushd $i
          ln -s ../js js
          ln -s ../region-index.html index.html
          ln -s ../css css
          ln -s ../syncstats2.js syncstats2.js
          echo "`pp $i` ** Done creating links..." 
        popd
    fi

    cd $i

    if [ -e $NEWSYNC ]; then
        /bin/rm -f $NEWSYNC
    fi
    if [ -e $NEWSYNC_gz ]; then
        /bin/rm -f $NEWSYNC_gz
    fi

    UNIX_NOW=`date +%s`

    URL="http://127.0.0.1/mlat-map/${i}/sync.json?$UNIX_NOW"

    LM_OK=0
    LM_OLD=0

    if [ -e $HEADER_FILE ]; then
        rm $HEADER_FILE
    fi

    # -q = quiet
    # -S = remote headers (for Last-Modified)
    # -O $NEWSYNC = where we output
    # --header='Accept-Encoding: gzip' = compress it (we'll uncompress here)
    #WGET_HEADERS=`wget -q -S -O $NEWSYNC_gz --header='Accept-Encoding: gzip' $URL 2>&1`
    #RV=$?
        #LM=`echo "$WGET_HEADERS" | perl -ne 'if (/Last-Modified: (.+)$/im) {$d=$1; $d=~s/,//g;printf("%s", $d);}'`
    #LM_U=`echo $LM | perl -ne 'use Date::Manip; $u=UnixDate(ParseDate($_), "%s");print $u'`
    #is_GZ=`echo "$WGET_HEADERS" | perl -ne 'BEGIN{$g=0};if (/Content-Encoding: gzip/i) {$g=1} END{ printf $g }'`
    #FETCH_HEADERS=$WGET_HEADERS

    # Switched to curl:
    #  -s = silent (no progress bar)
    # --compressed = requeist compressed xfer
    # -D file = output headers to file (to extract last-modified)
    CURL_OUTPUT=$( curl -s --compressed -D $HEADER_FILE $URL > $NEWSYNC_gz )
    RV=$?
    LM=$( cat $HEADER_FILE | perl -ne 'if (/Last-Modified: (.+)$/im) {$d=$1; $d=~s/[,\n\r]//g;printf("%s", $d);}' )
    LM_U=$( echo "$LM" | perl -ne 'use Date::Manip; $u=UnixDate(ParseDate($_), "%s");print $u' )
    is_GZ=0

    FETCH_HEADERS=$( cat $HEADER_FILE )

    if [ $RV -ne 0 ]; then
        echo "`pp $i` :: WARNING: URL [$URL] fetch failed.  RV=[$RV]  HEADERS=[$FETCH_HEADERS]" 
        if [ "x$CURL_OUTPUT" != "x" ]; then
            echo "`pp $i` :: curl output = [ $CURL_OUTPUT ]" 
        fi
        echo "`pp $i` :: Sleeping 5s and then continuing..." 
        sleep 5
        continue
    fi

    #echo "HEADERS = [ $FETCH_HEADERS ]" 
    #echo "LM = [ $LM ]" 
    #echo "LM_U = [ $LM_U ]" 
    #echo "is_GZ = [ $is_GZ ]"

    if [ "x$LM_U" != "x" ]; then
        # We have something, check that it's semi-valid
        if [ $LM_U -gt 0 ]; then
            MODIFIED_AGE=$(( UNIX_NOW - LM_U ))
            if [ $MODIFIED_AGE -gt 120 ]; then
                echo "`pp $i` :: WARNING: Last-Modified is $MODIFIED_AGE sec old ($LM) [ HEADERS = $FETCH_HEADERS ]" 
                LM_OLD=1
            fi
            LM_OK=1
        else
            echo "`pp $i` :: WARNING: Unix time for parsed Last-Modified [$LM] is zero." 
        fi
    else
        echo "`pp $i` :: WARNING: Unix time for parsed Last-Modified [$LM] is null." 

    fi

    RENAME=0

    # nb: we're still outputting to _gz name even with curl, just to make this part easier
    if [ -s $NEWSYNC_gz ]; then
        GZ_RV=0
        if [ $is_GZ -eq 1 ]; then 
            # If the new file is non-zero, let's uncompress and look at it...
            # nb: curl never gets here
            GUZ=`/bin/gunzip $NEWSYNC_gz 2>&1`
            GZ_RV=$?
            if [ $GZ_RV -ne 0 ]; then
                SAVEFILE="${NEWSYNC_gz}.$UNIX_NOW"
                echo "`pp $i` :: gunzip failed w/ error $GZ_RV" 
                echo "`pp $i` == [ $GUZ ]" 
                echo "`pp $i` == Full headers: [ $WGET_HEADERS ]" 
                echo "`pp $i` == Saving file as $SAVEFILE" 
                mv $NEWSYNC_gz $SAVEFILE
                # Don't set "RENAME", since this means we had an error -- so it will use the old file.
            fi
        else
            # For curl fetches, this is where we end up
            # For wget: This can happen when the data is very small (e.g. empty) (complain about it)
            if [ "x$WGET_HEADERS" != "x" ]; then
                echo "`pp $i` ** WARNING: asked for gzip, but headers indicate it wasn't sent gzip - renaming file..." 
                echo "`pp $i` :: HEADERS=[$WGET_HEADERS]" 
            fi
            mv $NEWSYNC_gz $NEWSYNC
        fi
        # gunzip worked (or it's not gzip'd), let's look at the data
        if [ $GZ_RV -eq 0 ]; then
            if [ $HAVE_JQ -eq 1 ]; then
                CNT=`jq length $NEWSYNC 2>&1`
                RV=$?
                if [ $RV -eq 0 ]; then
                    # 'jq' worked ok, JSON is clean, so OK to rename
                    RENAME=1
                else
                    echo "`pp $i` :: jq failed w/ error $RV:" 
                    echo "`pp $i` == [ $CNT ]" 
                    # NNS="${NEWSYNC}.`date +%s`"
                    # echo "`pp $i` :: Copying failed file to $NNS" 
                    # cp $NEWSYNC $NNS
                fi
            else
                # 'jq' not installed, do this the lame way.
                # NOTE: THIS MAY BREAK IF THE JSON FORMAT CHANGES!
                CNT=`egrep -c '^ \"' $NEWSYNC`
                JSON_OK=`tail -1 ${i}/sync.json  | grep -c '}'`
                if [[ $JSON_OK -eq 1 ]]; then
                    RENAME=1
                else
                    echo "`pp $i` :: JSON not ok (non-jq method)" 
                fi
            fi
        fi
    else
        # If we get here, we either don't have a file, or it's zero.
        if [ -e $NEWSYNC_gz ]; then
            # File exists, but must be zero (since the -s test, above, failed).  Complain.
            echo "`pp $i` :: Downloaded file is zero-length, not using it." 
        else
            # No file downloaded??
            echo "`pp $i` ** WARNING: Download failed?  Full headers: [ $FETCH_HEADERS ]" 
        fi
    fi

    OLD_TIME=""
    OLD_TIME_U=0

    # If we're not going to rename, count the old (existing) file, since the new one is jacked.
    if [ $RENAME -eq 0 ]; then
        echo "`pp $i` ** WARNING: experienced an error, using old datafile (and timestamp)" 
        if [ $HAVE_JQ -eq 1 ]; then
            CNT=`jq length $SYNC`
        else
            CNT=`egrep -c '^ \"' $SYNC`
        fi
        # Keep the old timestamp!
        OLD_TIME=`date -r $SYNC`
        OLD_TIME_U=`date +%s -r $SYNC`
    elif [ -s $NEWSYNC ]; then
        mv $NEWSYNC $SYNC
    fi

    # Sanity...
    if [ "x$CNT" == "x" ]; then
        echo "`pp $i` ** WARNING: No count - forcing to 0" 
        CNT=0
    fi
    if [ $OLD_TIME_U -gt 1 ]; then
        echo " \"$i\": [ $CNT, \"$OLD_TIME\", $OLD_TIME_U ]," >> $NEW_COUNTFILE
    elif [ $LM_U -gt 1 ]; then
        echo " \"$i\": [ $CNT, \"$LM\", $LM_U ]," >> $NEW_COUNTFILE
    else
        echo " \"$i\": [ $CNT, \"$LM\", 0 ]," >> $NEW_COUNTFILE
    fi
    #echo "Region $i has $CNT feeders"
done

# Just to make sure...
cd $SYNCPATH
# We have to do this because we have a trailing comma otherwise, so let's add the current time
TS=`date`
echo " \"UPDATED\": \"$TS\"" >> $NEW_COUNTFILE
echo "}" >> $NEW_COUNTFILE
mv $NEW_COUNTFILE $COUNTFILE
